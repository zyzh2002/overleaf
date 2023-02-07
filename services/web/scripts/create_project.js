// Script to create projects with sharelatex history for testing
// Example:
// node scripts/create_project.js --user-id=5dca84e11e71ae002ff73bd4 --name="My Test Project" --old-history

const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const parseArgs = require('minimist')
const OError = require('@overleaf/o-error')
const { waitForDb } = require('../app/src/infrastructure/mongodb')
const { User } = require('../app/src/models/User')
const ProjectCreationHandler = require('../app/src/Features/Project/ProjectCreationHandler')
const ProjectEntityUpdateHandler = require('../app/src/Features/Project/ProjectEntityUpdateHandler')
const ProjectEntityHandler = require('../app/src/Features/Project/ProjectEntityHandler')
const EditorController = require('../app/src/Features/Editor/EditorController')

const argv = parseArgs(process.argv.slice(2), {
  string: ['user-id', 'name'],
  boolean: ['old-history', 'random-content'],
  unknown: function (arg) {
    console.error('unrecognised argument', arg)
    process.exit(1)
  },
})

console.log('argv', argv)

const userId = argv['user-id']
const projectName = argv.name || `Test Project ${new Date().toISOString()}`
const oldHistory = argv['old-history']
const randomContent = argv['random-content']

console.log('userId', userId)

async function _createRootDoc(project, ownerId, docLines) {
  try {
    const { doc } = await ProjectEntityUpdateHandler.promises.addDoc(
      project._id,
      project.rootFolder[0]._id,
      'main.tex',
      docLines,
      ownerId,
      null
    )
    await ProjectEntityUpdateHandler.promises.setRootDoc(project._id, doc._id)
  } catch (error) {
    throw OError.tag(error, 'error adding root doc when creating project')
  }
}

async function _addDefaultExampleProjectFiles(ownerId, projectName, project) {
  const mainDocLines = await _buildTemplate(
    'example-project/main.tex',
    ownerId,
    projectName
  )
  await _createRootDoc(project, ownerId, mainDocLines)

  const bibDocLines = await _buildTemplate(
    'example-project/sample.bib',
    ownerId,
    projectName
  )
  await ProjectEntityUpdateHandler.promises.addDoc(
    project._id,
    project.rootFolder[0]._id,
    'sample.bib',
    bibDocLines,
    ownerId,
    null
  )

  const frogPath = path.join(
    __dirname,
    '/../app/templates/project_files/example-project/frog.jpg'
  )
  await ProjectEntityUpdateHandler.promises.addFile(
    project._id,
    project.rootFolder[0]._id,
    'frog.jpg',
    frogPath,
    null,
    ownerId,
    null
  )
}

async function _buildTemplate(templateName, userId, projectName) {
  const user = await User.findById(userId, 'first_name last_name')

  const templatePath = path.join(
    __dirname,
    `/../app/templates/project_files/${templateName}`
  )
  const template = fs.readFileSync(templatePath)
  const data = {
    project_name: projectName,
    user,
    year: new Date().getUTCFullYear(),
    month: new Date().getUTCMonth(),
  }
  const output = _.template(template.toString())(data)
  return output.split('\n')
}

// Create a project with some random content and file operations for testing history migrations
// Unfortunately we cannot easily change the timestamps of the history entries, so everything
// will be created at the same time.

async function _pickRandomDoc(project) {
  const result = await ProjectEntityHandler.promises.getAllDocs(project._id)
  const keys = Object.keys(result)
  if (keys.length === 0) {
    return null
  }
  const filepath = _.sample(keys)
  result[filepath].path = filepath
  return result[filepath]
}

let COUNTER = 0
// format counter as a 6 digit zero padded number
function nextId() {
  return ('000000' + COUNTER++).slice(-6)
}

async function _applyRandomDocUpdate(ownerId, project) {
  const action = _.sample(['create', 'edit', 'delete', 'rename'])
  switch (action) {
    case 'create': // create a new doc
      await EditorController.promises.upsertDocWithPath(
        project._id,
        `subdir/new-doc-${nextId()}.tex`,
        [`This is a new doc ${new Date().toISOString()}`],
        'create-project-script',
        ownerId
      )
      break
    case 'edit': {
      // edit an existing doc
      const doc = await _pickRandomDoc(project)
      if (!doc) {
        return
      }
      // pick a random line and either insert or delete a character
      const lines = doc.lines
      const index = _.random(0, lines.length - 1)
      let thisLine = lines[index]
      const pos = _.random(0, thisLine.length - 1)
      if (Math.random() > 0.5) {
        // insert a character
        thisLine = thisLine.slice(0, pos) + 'x' + thisLine.slice(pos)
      } else {
        // delete a character
        thisLine = thisLine.slice(0, pos) + thisLine.slice(pos + 1)
      }
      lines[index] = thisLine
      await EditorController.promises.upsertDocWithPath(
        project._id,
        doc.path,
        lines,
        'create-project-script',
        ownerId
      )
      break
    }
    case 'delete': {
      // delete an existing doc (but not the root doc)
      const doc = await _pickRandomDoc(project)
      if (!doc || doc.path === '/main.tex') {
        return
      }

      await EditorController.promises.deleteEntityWithPath(
        project._id,
        doc.path,
        ownerId,
        'create-project-script'
      )
      break
    }
    case 'rename': {
      // rename an existing doc (but not the root doc)
      const doc = await _pickRandomDoc(project)
      if (!doc || doc.path === '/main.tex') {
        return
      }
      const newName = `renamed-${nextId()}.tex`
      await EditorController.promises.renameEntity(
        project._id,
        doc._id,
        'doc',
        newName,
        ownerId,
        'create-project-script'
      )
      break
    }
  }
}

async function createProject() {
  await waitForDb()
  const user = await User.findById(userId)
  console.log('Will create project')
  console.log('user_id:', userId, '=>', user.email)
  console.log('project name:', projectName)
  const attributes = oldHistory ? { overleaf: {} } : {}
  const project = await ProjectCreationHandler.promises.createBlankProject(
    userId,
    projectName,
    attributes
  )
  await _addDefaultExampleProjectFiles(userId, projectName, project)
  if (randomContent) {
    for (let i = 0; i < 1000; i++) {
      await _applyRandomDocUpdate(userId, project)
    }
  }
  return project
}

createProject()
  .then(project => {
    console.log('Created project', project._id)
    process.exit()
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
