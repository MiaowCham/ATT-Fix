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

// Define format interface
interface JustlyricsFormat {
	formatKey: string
	displayName: string
	extensions: string[]
}

export const ImportExportLyric = () => {
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
	const onExportJustlyrics =
		(formatKey: justlyrics.LyricFormat.Type) =>
			async () => {
				try {
					const lyric = store.get(lyricLinesAtom).lyricLines
					const saveFileName = store.get(saveFileNameAtom)
					const baseName = saveFileName.replace(/\.[^.]*$/, "")
					const fileName = `${baseName}`

					const justlyricsLines = justlyrics.attLinesToCoreLyric(lyric)

					try {
						const result = await justlyrics.LyricFormat.requestWriteLyricsFile(
							justlyrics.LyricFormat.getLyricFormatDisplayName(formatKey),
							justlyrics.LyricFormat.getLyricFormatFileExtensions(formatKey),
							justlyrics.LyricIO.Dumping.dump(formatKey, justlyricsLines),
							{ fileName },
						)
						log(`Justlyrics export for ${formatKey}:`, result)
						// const data = typeof result === 'string' ? result : String(result)
						// const b = new Blob([data], { type: "" })
						// await saveFile(b, fileName)
					} catch (justlyricsError) {
						// If justlyrics fails, provide a fallback message
						console.warn(`Justlyrics export failed for ${formatKey}:`, justlyricsError)
						error(`Export failed for format "${formatKey}". The justlyrics library may have compatibility issues.`, justlyricsError)
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
								onClick={onExportJustlyrics(fmt)}
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
