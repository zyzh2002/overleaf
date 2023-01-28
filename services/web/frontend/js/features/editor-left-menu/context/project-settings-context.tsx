import { createContext, useContext, useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import useProjectWideSettings from '../hooks/use-project-wide-settings'
import useUserWideSettings from '../hooks/use-user-wide-settings'
import useProjectWideSettingsSocketListener from '../hooks/use-project-wide-settings-socket-listener'
import type { ProjectSettings, UserSettings } from '../utils/api'

type ProjectSettingsSetterContextValue = {
  setCompiler: (compiler: ProjectSettings['compiler']) => void
  setImageName: (imageName: ProjectSettings['imageName']) => void
  setRootDocId: (rootDocId: ProjectSettings['rootDocId']) => void
  setSpellCheckLanguage: (
    spellCheckLanguage: ProjectSettings['spellCheckLanguage']
  ) => void
  setAutoComplete: (autoComplete: UserSettings['autoComplete']) => void
  setAutoPairDelimiters: (
    autoPairDelimiters: UserSettings['autoPairDelimiters']
  ) => void
  setSyntaxValidation: (
    syntaxValidation: UserSettings['syntaxValidation']
  ) => void
  setMode: (mode: UserSettings['mode']) => void
  setEditorTheme: (editorTheme: UserSettings['editorTheme']) => void
  setOverallTheme: (overallTheme: UserSettings['overallTheme']) => void
  setFontSize: (fontSize: UserSettings['fontSize']) => void
  setFontFamily: (fontFamily: UserSettings['fontFamily']) => void
  setLineHeight: (lineHeight: UserSettings['lineHeight']) => void
  setPdfViewer: (pdfViewer: UserSettings['pdfViewer']) => void
}

type ProjectSettingsContextValue = Partial<ProjectSettings> &
  Partial<UserSettings> &
  ProjectSettingsSetterContextValue

export const ProjectSettingsContext = createContext<
  ProjectSettingsContextValue | undefined
>(undefined)

export function ProjectSettingsProvider({
  children,
}: PropsWithChildren<Record<string, never>>) {
  const {
    compiler,
    setCompiler,
    imageName,
    setImageName,
    rootDocId,
    setRootDocId,
    spellCheckLanguage,
    setSpellCheckLanguage,
  } = useProjectWideSettings()

  const {
    autoComplete,
    setAutoComplete,
    autoPairDelimiters,
    setAutoPairDelimiters,
    syntaxValidation,
    setSyntaxValidation,
    editorTheme,
    setEditorTheme,
    overallTheme,
    setOverallTheme,
    mode,
    setMode,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    lineHeight,
    setLineHeight,
    pdfViewer,
    setPdfViewer,
  } = useUserWideSettings()

  useProjectWideSettingsSocketListener()

  const value: ProjectSettingsContextValue = useMemo(
    () => ({
      compiler,
      setCompiler,
      imageName,
      setImageName,
      rootDocId,
      setRootDocId,
      spellCheckLanguage,
      setSpellCheckLanguage,
      autoComplete,
      setAutoComplete,
      autoPairDelimiters,
      setAutoPairDelimiters,
      syntaxValidation,
      setSyntaxValidation,
      editorTheme,
      setEditorTheme,
      overallTheme,
      setOverallTheme,
      mode,
      setMode,
      fontSize,
      setFontSize,
      fontFamily,
      setFontFamily,
      lineHeight,
      setLineHeight,
      pdfViewer,
      setPdfViewer,
    }),
    [
      compiler,
      setCompiler,
      imageName,
      setImageName,
      rootDocId,
      setRootDocId,
      spellCheckLanguage,
      setSpellCheckLanguage,
      autoComplete,
      setAutoComplete,
      autoPairDelimiters,
      setAutoPairDelimiters,
      syntaxValidation,
      setSyntaxValidation,
      editorTheme,
      setEditorTheme,
      overallTheme,
      setOverallTheme,
      mode,
      setMode,
      fontSize,
      setFontSize,
      fontFamily,
      setFontFamily,
      lineHeight,
      setLineHeight,
      pdfViewer,
      setPdfViewer,
    ]
  )

  return (
    <ProjectSettingsContext.Provider value={value}>
      {children}
    </ProjectSettingsContext.Provider>
  )
}

export function useProjectSettingsContext() {
  const context = useContext(ProjectSettingsContext)

  if (!context) {
    throw new Error(
      'useProjectSettingsContext is only available inside ProjectSettingsProvider'
    )
  }

  return context
}
