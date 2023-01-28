import getMeta from '../../../utils/meta'
import HumanReadableLogs from '../../../ide/human-readable-logs/HumanReadableLogs'
import BibLogParser from '../../../ide/log-parser/bib-log-parser'
import { v4 as uuid } from 'uuid'
import { enablePdfCaching } from './pdf-caching-flags'
import { fetchFromCompileDomain, swapDomain } from './fetchFromCompileDomain'
import { userContentDomainAccessCheckPassed } from '../../user-content-domain-access-check'

// Warnings that may disappear after a second LaTeX pass
const TRANSIENT_WARNING_REGEX = /^(Reference|Citation).+undefined on input line/

export function handleOutputFiles(outputFiles, projectId, data) {
  const outputFile = outputFiles.get('output.pdf')
  if (!outputFile) return null

  // build the URL for viewing the PDF in the preview UI
  const params = new URLSearchParams({
    compileGroup: data.compileGroup,
  })

  if (data.clsiServerId) {
    params.set('clsiserverid', data.clsiServerId)
  }

  if (enablePdfCaching) {
    // Tag traffic that uses the pdf caching logic.
    params.set('enable_pdf_caching', 'true')
  }

  outputFile.pdfUrl = `${buildURL(
    outputFile,
    data.pdfDownloadDomain,
    data.enableHybridPdfDownload
  )}?${params}`

  // build the URL for downloading the PDF
  params.set('popupDownload', 'true') // save PDF download as file

  outputFile.pdfDownloadUrl = `/download/project/${projectId}/build/${outputFile.build}/output/output.pdf?${params}`

  return outputFile
}

export const handleLogFiles = async (outputFiles, data, signal) => {
  const result = {
    log: null,
    logEntries: {
      errors: [],
      warnings: [],
      typesetting: [],
    },
  }

  function accumulateResults(newEntries, type) {
    for (const key in result.logEntries) {
      if (newEntries[key]) {
        for (const entry of newEntries[key]) {
          if (type) {
            entry.type = newEntries.type
          }
          if (entry.file) {
            entry.file = normalizeFilePath(entry.file)
          }
          entry.key = uuid()
        }
        result.logEntries[key].push(...newEntries[key])
      }
    }
  }

  const logFile = outputFiles.get('output.log')

  if (logFile) {
    try {
      const response = await fetchFromCompileDomain(
        buildURL(logFile, data.pdfDownloadDomain, data.enableHybridPdfDownload),
        { signal }
      )

      result.log = await response.text()

      let { errors, warnings, typesetting } = HumanReadableLogs.parse(
        result.log,
        {
          ignoreDuplicates: true,
          oldRegexes:
            getMeta('ol-splitTestVariants')?.['latex-log-parser'] !== 'new',
        }
      )

      if (data.status === 'stopped-on-first-error') {
        // Hide warnings that could disappear after a second pass
        warnings = warnings.filter(warning => !isTransientWarning(warning))
      }

      accumulateResults({ errors, warnings, typesetting })
    } catch (e) {
      console.warn(e) // ignore failure to fetch/parse the log file, but log a warning
    }
  }

  const blgFile = outputFiles.get('output.blg')

  if (blgFile) {
    try {
      const response = await fetchFromCompileDomain(
        buildURL(blgFile, data.pdfDownloadDomain, data.enableHybridPdfDownload),
        { signal }
      )

      const log = await response.text()

      try {
        const { errors, warnings } = new BibLogParser(log, {
          maxErrors: 100,
        }).parse()
        accumulateResults({ errors, warnings }, 'BibTeX:')
      } catch (e) {
        // BibLog parsing errors are ignored
      }
    } catch (e) {
      console.warn(e) // ignore failure to fetch/parse the log file, but log a warning
    }
  }

  result.logEntries.all = [
    ...result.logEntries.errors,
    ...result.logEntries.warnings,
    ...result.logEntries.typesetting,
  ]

  return result
}

export function buildLogEntryAnnotations(entries, fileTreeManager) {
  const rootDocDirname = fileTreeManager.getRootDocDirname()

  const logEntryAnnotations = {}

  for (const entry of entries) {
    if (entry.file) {
      entry.file = normalizeFilePath(entry.file, rootDocDirname)

      const entity = fileTreeManager.findEntityByPath(entry.file)

      if (entity) {
        if (!(entity.id in logEntryAnnotations)) {
          logEntryAnnotations[entity.id] = []
        }

        logEntryAnnotations[entity.id].push({
          row: entry.line - 1,
          type: entry.level === 'error' ? 'error' : 'warning',
          text: entry.message,
          source: 'compile', // NOTE: this is used in Ace for filtering the annotations
        })
      }
    }
  }

  return logEntryAnnotations
}

function buildURL(file, pdfDownloadDomain, enableHybridPdfDownload) {
  const userContentDomain = getMeta('ol-compilesUserContentDomain')
  if (
    enableHybridPdfDownload &&
    userContentDomainAccessCheckPassed() &&
    file.build &&
    userContentDomain
  ) {
    // This user is enrolled in the hybrid download of compile output.
    // The access check passed, so try to use the new user content domain.
    // Downloads from the compiles domains must include a build id.
    // The build id is used implicitly for access control.
    return swapDomain(`${pdfDownloadDomain}${file.url}`, userContentDomain)
  }
  if (file.build && pdfDownloadDomain) {
    // Downloads from the compiles domain must include a build id.
    // The build id is used implicitly for access control.
    return `${pdfDownloadDomain}${file.url}`
  }
  // Go through web instead, which uses mongo for checking project access.
  return `${window.origin}${file.url}`
}

function normalizeFilePath(path, rootDocDirname) {
  path = path.replace(/\/\//g, '/')
  path = path.replace(
    /^.*\/compiles\/[0-9a-f]{24}(-[0-9a-f]{24})?\/(\.\/)?/,
    ''
  )

  path = path.replace(/^\/compile\//, '')

  if (rootDocDirname) {
    path = path.replace(/^\.\//, rootDocDirname + '/')
  }

  return path
}

function isTransientWarning(warning) {
  return TRANSIENT_WARNING_REGEX.test(warning.message)
}
