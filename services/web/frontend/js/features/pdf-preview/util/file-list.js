const topFileTypes = ['bbl', 'gls', 'ind']
const ignoreFiles = ['output.fls', 'output.fdb_latexmk']

export const buildFileList = (outputFiles, clsiServerId, compileGroup) => {
  const files = { top: [], other: [] }

  if (outputFiles) {
    const params = new URLSearchParams()

    if (clsiServerId) {
      params.set('clsiserverid', clsiServerId)
    }
    if (compileGroup) {
      params.set('compileGroup', compileGroup)
    }

    const queryString = params.toString()

    const allFiles = []

    // filter out ignored files and set some properties
    for (const file of outputFiles.values()) {
      if (!ignoreFiles.includes(file.path)) {
        file.main = file.path.startsWith('output.')

        if (queryString.length) {
          file.url += `?${queryString}`
        }

        allFiles.push(file)
      }
    }

    // sort main files first, then alphabetical
    allFiles.sort((a, b) => {
      if (a.main && !b.main) {
        return -1
      }

      if (b.main && !a.main) {
        return 1
      }

      return a.path.localeCompare(b.path, undefined, { numeric: true })
    })

    // group files into "top" and "other"
    for (const file of allFiles) {
      if (topFileTypes.includes(file.type)) {
        files.top.push(file)
      } else if (!(file.type === 'pdf' && file.main === true)) {
        files.other.push(file)
      }
    }
  }

  return files
}
