import { importFromTextDialogAtom } from "$/states/dialogs.ts"
import { lyricLinesAtom, saveFileNameAtom } from "$/states/main.ts"
import { error, log } from "$/utils/logging.ts"
import {
	type LyricLine,
	parseEslrc,
	parseLrc,
	parseLys,
	parseQrc,
	parseYrc,
	stringifyAss,
	stringifyEslrc
} from "@applemusic-like-lyrics/lyric"
import { DropdownMenu } from "@radix-ui/themes"
import { useSetAtom, useStore } from "jotai"
import saveFile from "save-file"
import { uid } from "uid"

// Import justlyrics types and helpers
import * as justlyrics from "justlyrics"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"

// Define format interface
interface JustlyricsFormat {
	formatKey: string
	displayName: string
	extensions: string[]
}

function fixLineForLys<T extends justlyrics.CoreLyric.LineType>(line: T): T {
	if (line instanceof justlyrics.CoreLyric.SyllableSyncedLine) {
		let i = 1
		while (i < line.syllables.length) {
			const curr = line.syllables[i]
			if (curr.text == ' ') {
				line.syllables.splice(i, 1)
				line.syllables[i - 1].text += ' '
			}
			i++
		}
	}

	if (line.voiceAgent?.type === justlyrics.CoreLyric.VoiceAgentType.BackgroundVocal) {
		if (line instanceof justlyrics.CoreLyric.SyllableSyncedLine) {
			// if first syllable starts with （ or (, remove it
			while (
				line.syllables[0].text.startsWith('(') ||
				line.syllables[0].text.startsWith('（')
			) {
				line.syllables[0].text = line.syllables[0].text.slice(1)
			}
			// if last syllable ends with ) or )， remove it
			while (
				line.syllables[line.syllables.length - 1].text.endsWith(')') ||
				line.syllables[line.syllables.length - 1].text.endsWith('）')
			) {
				line.syllables[line.syllables.length - 1].text = line.syllables[
					line.syllables.length - 1
				].text.slice(0, -1)
			}

			// add new ()
			line.syllables[0].text = `(${line.syllables[0].text}`
			line.syllables[line.syllables.length - 1].text = `${line.syllables[line.syllables.length - 1].text
				})`
		} else if (line instanceof justlyrics.CoreLyric.LineSyncedLine) {
			// if first syllable starts with （ or (, remove it
			while (line.text.startsWith('(') || line.text.startsWith('（')) {
				line.text = line.text.slice(1)
			}
			// if last syllable ends with ) or )， remove it
			while (line.text.endsWith(')') || line.text.endsWith('）')) {
				line.text = line.text.slice(0, -1)
			}

			// add new ()
			line.text = `(${line.text})`
		}
	}

	return line
}

export const ImportExportLyric = (opt: {
	forceClose: () => void,
}) => {
	const store = useStore()
	const [justlyricsFormats, setJustlyricsFormats] = useState<JustlyricsFormat[]>([])

	// Load justlyrics formats on component mount
	useEffect(() => {
		try {
			// Get available formats excluding eslrc and ass (as requested)
			const formats = Object.keys(justlyrics.LyricFormat.TYPES)
			const filteredFormats = formats
				.filter(formatKey => formatKey !== 'eslrc' && formatKey !== 'ass')
				.map(formatKey => {
					const formatInfo = (justlyrics.LyricFormat.TYPES as any)[formatKey]
					return {
						formatKey,
						displayName: formatInfo.displayName,
						extensions: formatInfo.extensions
					}
				})
			setJustlyricsFormats(filteredFormats)
		} catch (e) {
			console.warn("Failed to load justlyrics formats:", e)
		}
	}, [])

	const onImportLyric =
		(parser: (lyric: string) => LyricLine[], extension: string) => () => {
			const inputEl = document.createElement("input")
			inputEl.type = "file"
			inputEl.accept = `.${extension},*/*`
			inputEl.addEventListener(
				"change",
				async () => {
					const file = inputEl.files?.[0]
					if (!file) return
					try {
						const lyricText = await file.text()
						const lyricLines = parser(lyricText)
						store.set(lyricLinesAtom, {
							lyricLines: lyricLines.map((line) => ({
								...line,
								words: line.words.map((word) => ({
									...word,
									id: uid(),
									obscene: false,
									emptyBeat: 0,
								})),
								ignoreSync: false,
								id: uid(),
							})),
							metadata: [],
						})
					} catch (e) {
						error(`Failed to import lyric with format "${extension}"`, e)
					}
				},
				{
					once: true,
				},
			)
			inputEl.click()
		}
	const onExportLyric =
		(stringifier: (lines: LyricLine[]) => string, extension: string) =>
			async () => {
				const lyric = store.get(lyricLinesAtom).lyricLines
				const saveFileName = store.get(saveFileNameAtom)
				const baseName = saveFileName.replace(/\.[^.]*$/, "")
				const fileName = `${baseName}.${extension}`
				try {
					const data = stringifier(lyric)
					const b = new Blob([data], { type: "text/plain" })
					await saveFile(b, fileName)
				} catch (e) {
					error(`Failed to export lyric with format "${extension}"`, e)
				}
			}

	// Enhanced export handler for justlyrics formats
	const onExportJustlyricsHdlGen =
		(formatKey: justlyrics.LyricFormat.Type, mode: 'file' | 'clipboard') =>
			async () => {
				try {
					const currAtt = store.get(lyricLinesAtom)
					const lyric = currAtt.lyricLines
					const saveFileName = store.get(saveFileNameAtom)
					const baseName = saveFileName.replace(/\.[^.]*$/, "")
					const fileName = `${baseName}`

					const justlyricsLines = justlyrics.attLinesToCoreLyric(lyric)
					if (!justlyricsLines) {
						toast.error("导出失败：歌词无内容")
						return
					}

					let footer = '',
						header = ''
					switch (formatKey) {
						// @ts-ignore ts(7029)
						case 'lyl':
							header += '[type:LyricifyLines]\n'
						// @ts-ignore ts(7029)
						case 'lqe':
							if (formatKey == 'lqe') {
								header += '[Lyricify Quick Export]\n'
								header += '[version:1.0]\n'
							}
						case 'lys':
						case 'qrc':
						case 'lrc':
							const lrcHeader = justlyrics.attMetaToLrcHeader(
								currAtt?.metadata || []
							).trim()
							header += lrcHeader
							if (lrcHeader) header += '\n'
							if (formatKey == 'lqe') header += '\n'
							break

						case 'yrc':
							header += justlyrics.attMetaToYrcHeader(currAtt?.metadata || [])
								.map((d) => {
									return JSON.stringify(d)
								})
								.join('\n')
							header += '\n'
							break

						default:
							break
					}

					let fixedCl
					switch (formatKey) {
						case 'lys':
						case 'qrc':
						case 'lqe':
							// special fix
							// `\((\d+),(\d+)\) \(0,0\)` TO ` ($1,$2)`
							fixedCl = justlyricsLines.map(fixLineForLys)
							break
						default:
							fixedCl = justlyricsLines
							break
					}

					const content = justlyrics.LyricIO.Dumping.dump(formatKey, fixedCl)

					const concatenatedContent = header + content + footer

					switch (mode) {
						case 'file':
							try {
								const result = await justlyrics.LyricFormat.requestWriteLyricsFile(
									justlyrics.LyricFormat.getLyricFormatDisplayName(formatKey),
									justlyrics.LyricFormat.getLyricFormatFileExtensions(formatKey),
									concatenatedContent,
									{ fileName },
								)
								log(`Justlyrics export for ${formatKey}:`, result, concatenatedContent)
								if (result)
									toast.info("歌词已导出")
								else
									toast.error("歌词导出失败：已取消")
								// await saveFile(b, fileName)
							} catch (justlyricsError: any) {
								if ((justlyricsError.message || "").includes('aborted')) {
									toast.error("歌词导出失败：已取消")
								}
								// If justlyrics fails, provide a fallback message
								console.warn(`Justlyrics export failed for ${formatKey}:`, justlyricsError)
								error(`Export failed for format "${formatKey}". The justlyrics library may have compatibility issues.`, justlyricsError)
							}
							break

						case 'clipboard':
							try {
								await navigator.clipboard.writeText(concatenatedContent)
								log(`Justlyrics export for ${formatKey} to clipboard:`, concatenatedContent)
								toast.info("歌词已复制到剪贴板")
							} catch (clipboardError) {
								// If clipboard fails, provide a fallback message
								console.warn(`Justlyrics export to clipboard failed for ${formatKey}:`, clipboardError)
								error(`Export to clipboard failed for format "${formatKey}". The clipboard may be locked or unavailable. Please try again with a different mode or browser extension.`)
							}
							break

						default:
							error(`Invalid export mode "${mode}" for format "${formatKey}"`)
							break
					}
				} catch (e) {
					error(`Failed to export lyric with format "${formatKey}"`, e)
				}
			}
	const setImportFromTextDialog = useSetAtom(importFromTextDialogAtom)

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>导入歌词...</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<DropdownMenu.Item onClick={() => setImportFromTextDialog(true)}>
						从纯文本导入
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onImportLyric(parseLrc, "lrc")}>
						从 LyRiC 文件导入
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onImportLyric(parseEslrc, "lrc")}>
						从 ESLyRiC 文件导入
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onImportLyric(parseQrc, "qrc")}>
						从 QRC 文件导入
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onImportLyric(parseYrc, "yrc")}>
						从 YRC 文件导入
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onImportLyric(parseLys, "lys")}>
						从 Lyricify Syllable 文件导入
					</DropdownMenu.Item>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>导出歌词...</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					{/* Keep ESLyRiC and ASS as requested */}
					<DropdownMenu.Item onClick={onExportLyric(stringifyEslrc, "lrc")}>
						导出到 ESLyRiC
					</DropdownMenu.Item>
					<DropdownMenu.Item onClick={onExportLyric(stringifyAss, "ass")}>
						导出到 ASS 字幕
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					{/* Dynamic justlyrics formats using for...of loop */}
					{justlyricsFormats.map(format => {
						const fmt = format.formatKey as justlyrics.LyricFormat.Type
						const isSupported = justlyrics.LyricIO.Dumping.supportDump(fmt)
						if (!isSupported) {
							console.warn(`Justlyrics format ${fmt} is not supported. Skipping...`)
							return null
						}
						return (
							<DropdownMenu.Item
								key={format.formatKey}
								onClick={onExportJustlyricsHdlGen(fmt, 'file')}
								onContextMenu={e => {
									e.preventDefault()
									e.stopPropagation()
									onExportJustlyricsHdlGen(fmt, 'clipboard')()
								}}
							>
								导出到 {format.displayName}
							</DropdownMenu.Item>
						)
					})}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</>
	)
}
