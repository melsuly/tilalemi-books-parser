const rp = require("request-promise")
const cheerio = require("cheerio")
const axios = require("axios")
const fs = require("fs")

const baseURL = "https://tilalemi.kz"
let count = 0
const results = []

// 206 - 1217 (existing books indices range)
const parseBooks = async () => {
	const start = 206
	const end = 1217

	for (let i = start; i <= end; i++) {
		let bookURL = `${baseURL}/tartu/one/${i}`

		const parseBook = async () => {
			await rp(bookURL)
				.then(html => {
					const $ = cheerio.load(html)
					const title = $(".kitap-page__title").text().trim()

					if (title) {
						const authors = $(".kitap-page__author-b")
							.text()
							.split(",")
							.map(author => author.replace(/\n/g, " ").trim())
						const description = $(".kitap-page__about__text")
							.text()
							.replace(/\n/g, " ")
							.trim()
						const rubric = $(".kitap-page__section")
							.text()
							.replace(/\n/g, " ")
							.trim()
						const imageURL =
							baseURL + $(".kitap-page__img").attr("src")
						const fileURL =
							baseURL +
							new URLSearchParams(
								new URL(
									$("a.kitap-page__link").attr("href"),
									baseURL
								).search
							).get("file")

						const result = {
							title,
							authors,
							description,
							rubric,
							imageURL,
							fileURL,
						}

						results.push(result)

						fs.writeFile(
							"./output.json",
							JSON.stringify(results, null, 4),
							err => {
								if (err) {
									console.log(err)
								}
							}
						)

						count += 1
					}
				})
				.catch(error => {
					console.log(error)
				})
		}

		await parseBook()
	}
}

const app = async () => {
	parseBooks().then(() => {
		console.log(count)
	})
}

app()

const legacy_parseBooks = () => {
	rp(url)
		.then(async html => {
			const $ = cheerio.load(html)

			const links = $("a.main-page__tartu__section", html)

			console.log(links.length)

			let i = 0

			await links.each(async function () {
				const link = "https://tilalemi.kz" + $(this).attr("href")
				const title = $(this).text()
				const linkContent = await rp(link)
				const $$ = cheerio.load(linkContent)
				const authors = $$(".kitap-page__author-b")
					.text()
					.trim("\n")
					.trim()
				const linkToBook = $$("a.kitap-page__link").attr("href")
				const description = $$(".kitap-page__about__text")
					.text()
					.trim("\n")
					.trim()

				let fileValue =
					"https://tilalemi.kz" +
					new URLSearchParams(
						new URL(linkToBook, "https://tilalemi.kz").search
					).get("file")

				await fs.promises.mkdir(`./output/${title}`, {
					recursive: true,
				})

				result = {
					title,
					authors,
					description,
					linkToBook,
					fileValue,
				}

				await fs.writeFile(
					`./output/${title}/data.json`,
					JSON.stringify(result, null, 4),
					err => {
						if (err) {
							// console.log("File download error!")
						}
					}
				)

				await downloadPDF(
					fileValue,
					`./output/${title}/${title}.pdf`
				).then(() => {
					i++
				})
			})
		})
		.catch(err => {
			// console.log(err)
		})

	async function downloadPDF(pdfURL, outputPath) {
		try {
			const response = await axios({
				method: "GET",
				url: pdfURL,
				responseType: "stream",
			})

			const writer = fs.createWriteStream(outputPath)

			response.data.pipe(writer)

			return new Promise((resolve, reject) => {
				writer.on("finish", resolve)
				writer.on("error", reject)
			})
		} catch (error) {
			// console.error("Error downloading the PDF:", error)
		}
	}
}
