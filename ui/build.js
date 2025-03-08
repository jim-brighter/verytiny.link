const fs = require('fs')
const path = require('path')

const fileReplacements = []
const timestamp = Date.now()

const isValidFile = (filename) => {
  return filename !== 'build.js' && (filename.endsWith('.css') || filename.endsWith('.js') || filename.endsWith('.html'))
}

const copyFileWithDir = (source, dest) => {
  const dir = path.dirname(dest)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.copyFileSync(source, dest)
}

if (fs.existsSync('dist')) {
  fs.rmSync('dist', {
    recursive: true
  })
}

fs.mkdirSync('dist')

fs.readdirSync('.', {
  recursive: true
})
  .filter((entry) => isValidFile(entry))
  .forEach((oldFile) => {
    if (oldFile === 'index.html') {
      copyFileWithDir(oldFile, `dist/${oldFile}`)
      return
    }

    const splitName = oldFile.split('.')
    const newFile = `${splitName[0]}.${timestamp}.${splitName[1]}`

    fileReplacements.push({
      oldName: oldFile.split('/').pop(),
      newName: newFile.split('/').pop()
    })

    copyFileWithDir(oldFile, `dist/${newFile}`)
  })

fs.readdirSync('dist', {
  recursive: true
})
  .filter((entry) => isValidFile(entry))
  .forEach((filename) => {
    let contents = fs.readFileSync(`dist/${filename}`, {
      encoding: 'utf-8'
    })

    for (let replacement of fileReplacements) {
      contents = contents.replace(replacement.oldName, replacement.newName)
    }

    fs.writeFileSync(`dist/${filename}`, contents, {
      encoding: 'utf-8',
      flush: true
    })
  })

console.log('UI Built Successfully')
