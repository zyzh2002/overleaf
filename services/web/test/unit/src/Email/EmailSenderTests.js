const SandboxedModule = require('sandboxed-module')
const path = require('path')
const sinon = require('sinon')
const { expect } = require('chai')

const MODULE_PATH = path.join(
  __dirname,
  '../../../../app/src/Features/Email/EmailSender.js'
)

describe('EmailSender', function () {
  beforeEach(function () {
    this.rateLimiter = {
      consume: sinon.stub().resolves(),
    }
    this.RateLimiter = {
      RateLimiter: sinon.stub().returns(this.rateLimiter),
    }

    this.Settings = {
      email: {
        transport: 'ses',
        parameters: {
          AWSAccessKeyID: 'key',
          AWSSecretKey: 'secret',
        },
        fromAddress: 'bob@bob.com',
        replyToAddress: 'sally@gmail.com',
      },
    }

    this.sesClient = { sendMail: sinon.stub().resolves() }

    this.ses = { createTransport: () => this.sesClient }

    this.EmailSender = SandboxedModule.require(MODULE_PATH, {
      requires: {
        nodemailer: this.ses,
        'nodemailer-ses-transport': sinon.stub(),
        'nodemailer-mandrill-transport': {},
        '@overleaf/settings': this.Settings,
        '../../infrastructure/RateLimiter': this.RateLimiter,
        '@overleaf/metrics': {
          inc() {},
        },
      },
    })

    this.opts = {
      to: 'bob@bob.com',
      subject: 'new email',
      html: '<hello></hello>',
    }
  })

  describe('sendEmail', function () {
    it('should set the properties on the email to send', async function () {
      await this.EmailSender.promises.sendEmail(this.opts)
      expect(this.sesClient.sendMail).to.have.been.calledWithMatch({
        html: this.opts.html,
        to: this.opts.to,
        subject: this.opts.subject,
      })
    })

    it('should return a non-specific error', async function () {
      this.sesClient.sendMail.rejects(new Error('boom'))
      await expect(this.EmailSender.promises.sendEmail({})).to.be.rejectedWith(
        'error sending message'
      )
    })

    it('should use the from address from settings', async function () {
      await this.EmailSender.promises.sendEmail(this.opts)
      expect(this.sesClient.sendMail).to.have.been.calledWithMatch({
        from: this.Settings.email.fromAddress,
      })
    })

    it('should use the reply to address from settings', async function () {
      await this.EmailSender.promises.sendEmail(this.opts)
      expect(this.sesClient.sendMail).to.have.been.calledWithMatch({
        replyTo: this.Settings.email.replyToAddress,
      })
    })

    it('should use the reply to address in options as an override', async function () {
      this.opts.replyTo = 'someone@else.com'
      await this.EmailSender.promises.sendEmail(this.opts)
      expect(this.sesClient.sendMail).to.have.been.calledWithMatch({
        replyTo: this.opts.replyTo,
      })
    })

    it('should not send an email when the rate limiter says no', async function () {
      this.opts.sendingUser_id = '12321312321'
      this.rateLimiter.consume.rejects({ remainingPoints: 0 })
      await expect(this.EmailSender.promises.sendEmail(this.opts)).to.be
        .rejected
      expect(this.sesClient.sendMail).not.to.have.been.called
    })

    it('should send the email when the rate limtier says continue', async function () {
      this.opts.sendingUser_id = '12321312321'
      await this.EmailSender.promises.sendEmail(this.opts)
      expect(this.sesClient.sendMail).to.have.been.called
    })

    it('should not check the rate limiter when there is no sendingUser_id', async function () {
      this.EmailSender.sendEmail(this.opts, () => {
        expect(this.sesClient.sendMail).to.have.been.called
        expect(this.rateLimiter.consume).not.to.have.been.called
      })
    })

    describe('with plain-text email content', function () {
      beforeEach(function () {
        this.opts.text = 'hello there'
      })

      it('should set the text property on the email to send', async function () {
        await this.EmailSender.promises.sendEmail(this.opts)
        expect(this.sesClient.sendMail).to.have.been.calledWithMatch({
          html: this.opts.html,
          text: this.opts.text,
          to: this.opts.to,
          subject: this.opts.subject,
        })
      })
    })
  })
})
