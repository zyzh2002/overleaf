const chai = require('chai')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const chaiAsPromised = require('chai-as-promised')
const SandboxedModule = require('sandboxed-module')

process.env.BACKEND = 'gcs'

// Chai configuration
chai.should()
chai.use(sinonChai)
chai.use(chaiAsPromised)

// Global stubs
const sandbox = sinon.createSandbox()
const stubs = {
  logger: {
    debug: sandbox.stub(),
    log: sandbox.stub(),
    info: sandbox.stub(),
    warn: sandbox.stub(),
    err: sandbox.stub(),
    error: sandbox.stub(),
    fatal: sandbox.stub(),
  },
}

// SandboxedModule configuration
SandboxedModule.configure({
  requires: {
    '@overleaf/logger': stubs.logger,
  },
  globals: { Buffer, JSON, Math, console, process },
})

exports.mochaHooks = {
  beforeEach() {
    this.logger = stubs.logger
  },

  afterEach() {
    sandbox.reset()
  },
}
