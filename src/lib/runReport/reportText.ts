// The copied text is the bug report: it starts with the summary and has each fact of the panel, with the same labels and units.
import {
  DETAILS_TITLE,
  formatStartTime,
  type PanelFact,
  type PanelSection,
  type PanelTable,
  reportPanel,
} from './reportPanel.ts'
import { alignedTable, type NamedVoice, type RunReport } from './runReport.ts'
import { singerSummary } from './singerSummary.ts'

function factLines(facts: readonly PanelFact[]): string[] {
  return facts.map((fact) => `${fact.label}: ${fact.value}`)
}

function tableLines(tables: readonly PanelTable[]): string[] {
  return tables.flatMap((table) =>
    table.rows.length === 0
      ? [`${table.caption}: none`]
      : [`${table.caption}:`, ...alignedTable([table.columns, ...table.rows])],
  )
}

function sectionLines(section: PanelSection, summary: string): string[] {
  const { details } = section
  return [
    `[${section.title}]`,
    // The summary of the singer step is at the top of the text, so the section does not repeat it.
    ...(section.text === null || section.text === summary ? [] : [section.text]),
    ...tableLines(section.tables),
    ...factLines(section.facts),
    ...section.items,
    ...(details === null
      ? []
      : [`${DETAILS_TITLE}:`, ...factLines(details.facts), ...tableLines(details.tables)]),
  ]
}

/**
 * Returns the report as plain text to paste into a chat or to save as `report.txt`.
 * The text starts with the summary of the singer step. Then each section of the panel follows with a heading line in
 * brackets, the same labels and the same units as the panel, and each number of the details part.
 * The text holds the names of the voices and no lyrics.
 * @param report The report of a run.
 * @param formatDate Returns the start time as a text. The default is the local time and the UTC time.
 * @param voices The present voices of the song, so the text names each voice as the panel does.
 */
export function reportToText(
  report: RunReport,
  formatDate: (iso: string) => string = (iso) => formatStartTime(iso),
  voices?: readonly NamedVoice[],
): string {
  const summaryLines = singerSummary(report.singers)
  const summary = summaryLines.join(' ')
  const sections = [
    ['Transcribe run report'],
    ['[Summary]', ...summaryLines],
    ...reportPanel(report, formatDate, voices).map((section) => sectionLines(section, summary)),
  ]
  return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`
}
