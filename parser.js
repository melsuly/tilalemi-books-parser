const rp = require("request-promise")
const cheerio = require("cheerio")
const fs = require("fs")
const path = require("path")

const downloadDir = "./downloads"
const sqlAuthorsFile = "./sql/2_insert_authors.sql"
const sqlRubricsFile = "./sql/1_insert_rubrics.sql"
const sqlMaterialsFile = "./sql/3_insert_materials.sql"
const errorFile = "./sql/error.json"

let count = 0
let errorIds = []

const baseURL = "https://tilalemi.kz"

const urls = {
	books: `${baseURL}/tartu`,
	book: index => `${baseURL}/tartu/one/${index}`,
	asset: asset => `${baseURL}${asset}`,
}

const start = 206 // min 206
const end = 1217 // max 1217

const authorsMap = new Map()
const rubricsMap = new Map()

const generateSQLForAuthors = async () => {
	for (const [author, id] of authorsMap) {
		const sql = `INSERT INTO authors (id, fullname, description) VALUES (${id}, '${escapeStringForSQL(
			author
		)}', '');`
		await fs.appendFileSync(sqlAuthorsFile, sql + "\n")
	}
}

const generateSQLForRubrics = async () => {
	for (const [rubric, id] of rubricsMap) {
		const sql = `INSERT INTO rubrics (id, catalog_id, title) VALUES (${id}, 1,'${rubric}');`
		await fs.appendFileSync(sqlRubricsFile, sql + "\n")
	}
}

const generateSQLForBook = async book => {
	let sql = `INSERT INTO materials (id, title, description, imagesrc, filepath, rubrics_id) VALUES (${count}, '${escapeStringForSQL(
		book.title
	)}', '${escapeStringForSQL(book.description)}', '${book.imageFilePath}', '${
		book.pdfFilePath
	}', ${book.rubricId});`
	book.authorIds.forEach(authorId => {
		sql += `\nINSERT INTO author_material (material_id, author_id) VALUES (${count}, ${authorId});`
	})

	await fs.appendFileSync(sqlMaterialsFile, sql + "\n")
}

const escapeStringForSQL = str => {
	return str.replace(/'/g, "''")
}

const prepareFolders = async () => {
	if (!fs.existsSync(downloadDir)) {
		await fs.mkdirSync(downloadDir)
	} else {
		await fs.readdirSync(downloadDir).forEach(file => {
			fs.unlinkSync(path.join(downloadDir, file))
		})
	}

	if (!fs.existsSync("./dist")) {
		await fs.mkdirSync("./dist")
	} else {
		await fs.readdirSync("./dist").forEach(file => {
			fs.unlinkSync(path.join("./dist", file))
		})
	}

	if (!fs.existsSync("./sql")) {
		await fs.mkdirSync("./sql")
	} else {
		await fs.readdirSync("./sql").forEach(file => {
			fs.unlinkSync(path.join("./sql", file))
		})
	}

	fs.writeFileSync(sqlAuthorsFile, "")
	fs.writeFileSync(sqlRubricsFile, "")
	fs.writeFileSync(sqlMaterialsFile, "")
}

const downloadFile = async (url, filePath) => {
	const uri = encodeURI(url)

	try {
		const fileData = await rp({ uri, encoding: null })
		await fs.promises.writeFile(filePath, fileData)
	} catch (error) {
		throw new Error(
			`Failed to download ${filePath} from ${uri}: ${error.message}`
		)
	}
}

const deleteSpecialChars = str => {
	const regex = /[&\/\\#,+()$~%'":*?<>{}\n\x1A]/gi
	return str.replace(regex, "")
}

const getCleanText = ($, selector) => {
	return $(selector).text().replace(/\n/g, " ").trim()
}

const getAuthorIds = authors => {
	return authors.map(author => {
		if (!authorsMap.has(author)) {
			authorsMap.set(author, authorsMap.size + 1)
		}
		return authorsMap.get(author)
	})
}

const getRubricId = rubric => {
	if (!rubricsMap.has(rubric)) {
		rubricsMap.set(rubric, rubricsMap.size + 1)
	}
	return rubricsMap.get(rubric)
}

const parseBook = async index => {
	const bookURL = urls.book(index)

	try {
		const html = await rp(bookURL)
		const $ = cheerio.load(html)
		const title = getCleanText($, ".kitap-page__title")
		const authors = $(".kitap-page__author-b")
			.text()
			.split(",")
			.map(author => deleteSpecialChars(author).trim())
			.filter(author => author)

		const description = getCleanText($, ".kitap-page__about__text")
		const rubric = getCleanText($, ".kitap-page__section")
		const imageURL = urls.asset($(".kitap-page__img").attr("src"))
		const fileURL = urls.asset(
			new URLSearchParams(
				new URL($("a.kitap-page__link").attr("href"), baseURL).search
			).get("file")
		)

		if (!title) return null

		const imageFilePath = path.join(
			downloadDir,
			`book_${index}.${imageURL.split(".").pop()}`
		)
		const pdfFilePath = path.join(downloadDir, `book_${index}.pdf`)

		await downloadFile(imageURL, imageFilePath)
		await downloadFile(fileURL, pdfFilePath)

		if (fs.existsSync(pdfFilePath) && fs.existsSync(imageFilePath)) {
			count++

			// move files to dist folder if exists and delete from downloads

			fs.renameSync(
				imageFilePath,
				path.join("./dist", imageFilePath.split("/").pop())
			)

			fs.renameSync(
				pdfFilePath,
				path.join("./dist", pdfFilePath.split("/").pop())
			)

			return {
				index,
				title,
				authorIds: getAuthorIds(authors),
				description,
				rubricId: getRubricId(rubric),
				imageFilePath: imageFilePath.split("/").pop(),
				pdfFilePath: pdfFilePath.split("/").pop(),
			}
		}

		errorIds.push({
			index,
			error: "File not found",
		})

		fs.writeFileSync(errorFile, JSON.stringify(errorIds))

		return null
	} catch (error) {
		errorIds.push({
			index,
			error: error.message,
		})

		fs.writeFileSync(errorFile, JSON.stringify(errorIds))

		console.error(`Failed to parse ${bookURL}: ${error.message}`)
	}
}

const processBooks = async () => {
	await prepareFolders()

	for (let index = start; index <= end; index++) {
		const book = await parseBook(index)

		if (book) {
			await generateSQLForBook(book)
		}
	}

	await generateSQLForAuthors()
	await generateSQLForRubrics()
}

processBooks()
