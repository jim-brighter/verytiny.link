const fs = require('fs')

const fileReplacements = []
const timestamp = Date.now()

const isValidFile = (filename) => {
  return filename !== 'build.js' && (filename.endsWith('.css') || filename.endsWith('.js') || filename.endsWith('.html'))
}

fs.readdirSync('.', {
  recursive: true
})
.filter((entry) => isValidFile(entry))
.forEach((oldFile) => {
  if (oldFile === 'index.html') {
    return
  }

  const splitName = oldFile.split('.')
  const newFile = `${splitName[0]}.${timestamp}.${splitName[1]}`

  fileReplacements.push({
    oldName: oldFile.split('/').pop(),
    newName: newFile.split('/').pop()
  })

  fs.renameSync(oldFile, newFile)
})

fs.readdirSync('.', {
  recursive: true
})
.filter((entry) => isValidFile(entry))
.forEach((filename) => {
  let contents = fs.readFileSync(filename, {
    encoding: 'utf-8'
  })

  for (let replacement of fileReplacements) {
    contents = contents.replace(replacement.oldName, replacement.newName)
  }

  fs.writeFileSync(filename, contents, {
    encoding: 'utf-8',
    flush: true
  })
})
