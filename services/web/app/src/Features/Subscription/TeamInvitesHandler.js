let TeamInvitesHandler
const logger = require('@overleaf/logger')
const crypto = require('crypto')
const async = require('async')

const settings = require('@overleaf/settings')
const { ObjectId } = require('mongodb')

const { Subscription } = require('../../models/Subscription')

const UserGetter = require('../User/UserGetter')
const SubscriptionLocator = require('./SubscriptionLocator')
const SubscriptionUpdater = require('./SubscriptionUpdater')
const LimitationsManager = require('./LimitationsManager')

const EmailHandler = require('../Email/EmailHandler')
const EmailHelper = require('../Helpers/EmailHelper')

const Errors = require('../Errors/Errors')

module.exports = TeamInvitesHandler = {
  getInvite(token, callback) {
    Subscription.findOne(
      { 'teamInvites.token': token },
      function (err, subscription) {
        if (err) {
          return callback(err)
        }
        if (!subscription) {
          return callback(new Errors.NotFoundError('team not found'))
        }

        const invite = subscription.teamInvites.find(i => i.token === token)
        callback(null, invite, subscription)
      }
    )
  },

  createInvite(teamManagerId, subscription, email, callback) {
    email = EmailHelper.parseEmail(email)
    if (!email) {
      return callback(new Error('invalid email'))
    }
    UserGetter.getUser(teamManagerId, function (error, teamManager) {
      if (error) {
        return callback(error)
      }

      removeLegacyInvite(subscription.id, email, function (error) {
        if (error) {
          return callback(error)
        }
        createInvite(subscription, email, teamManager, callback)
      })
    })
  },

  importInvite(subscription, inviterName, email, token, sentAt, callback) {
    checkIfInviteIsPossible(
      subscription,
      email,
      function (error, possible, reason) {
        if (error) {
          return callback(error)
        }
        if (!possible) {
          return callback(reason)
        }

        subscription.teamInvites.push({
          email,
          inviterName,
          token,
          sentAt,
        })

        subscription.save(callback)
      }
    )
  },

  acceptInvite(token, userId, callback) {
    TeamInvitesHandler.getInvite(token, function (err, invite, subscription) {
      if (err) {
        return callback(err)
      }
      if (!invite) {
        return callback(new Errors.NotFoundError('invite not found'))
      }

      SubscriptionUpdater.addUserToGroup(
        subscription._id,
        userId,
        function (err) {
          if (err) {
            return callback(err)
          }

          removeInviteFromTeam(subscription.id, invite.email, callback)
        }
      )
    })
  },

  revokeInvite(teamManagerId, subscription, email, callback) {
    email = EmailHelper.parseEmail(email)
    if (!email) {
      return callback(new Error('invalid email'))
    }
    removeInviteFromTeam(subscription.id, email, callback)
  },

  // Legacy method to allow a user to receive a confirmation email if their
  // email is in Subscription.invited_emails when they join. We'll remove this
  // after a short while.
  createTeamInvitesForLegacyInvitedEmail(email, callback) {
    SubscriptionLocator.getGroupsWithEmailInvite(email, function (err, teams) {
      if (err) {
        return callback(err)
      }

      async.map(
        teams,
        (team, cb) =>
          TeamInvitesHandler.createInvite(team.admin_id, team, email, cb),
        callback
      )
    })
  },
}

function createInvite(subscription, email, inviter, callback) {
  checkIfInviteIsPossible(
    subscription,
    email,
    function (error, possible, reason) {
      if (error) {
        return callback(error)
      }
      if (!possible) {
        return callback(reason)
      }

      // don't send invites when inviting self; add user directly to the group
      const isInvitingSelf = inviter.emails.some(
        emailData => emailData.email === email
      )
      if (isInvitingSelf) {
        return SubscriptionUpdater.addUserToGroup(
          subscription._id,
          inviter._id,
          err => {
            if (err) {
              return callback(err)
            }

            // legacy: remove any invite that might have been created in the past
            removeInviteFromTeam(subscription._id, email, error => {
              const inviteUserData = {
                email: inviter.email,
                first_name: inviter.first_name,
                last_name: inviter.last_name,
                invite: false,
              }
              callback(error, inviteUserData)
            })
          }
        )
      }

      const inviterName = getInviterName(inviter)
      let invite = subscription.teamInvites.find(
        invite => invite.email === email
      )

      if (invite) {
        invite = invite.toObject()
        invite.sentAt = new Date()
      } else {
        invite = {
          email,
          inviterName,
          token: crypto.randomBytes(32).toString('hex'),
          sentAt: new Date(),
        }
        subscription.teamInvites.push(invite)
      }

      subscription.save(function (error) {
        if (error) {
          return callback(error)
        }

        const opts = {
          to: email,
          inviter,
          acceptInviteUrl: `${settings.siteUrl}/subscription/invites/${invite.token}/`,
          appName: settings.appName,
        }
        EmailHandler.sendEmail('verifyEmailToJoinTeam', opts, error => {
          Object.assign(invite, { invite: true })
          callback(error, invite)
        })
      })
    }
  )
}

function removeInviteFromTeam(subscriptionId, email, callback) {
  const searchConditions = { _id: new ObjectId(subscriptionId.toString()) }
  const removeInvite = { $pull: { teamInvites: { email } } }

  async.series(
    [
      cb => Subscription.updateOne(searchConditions, removeInvite, cb),
      cb => removeLegacyInvite(subscriptionId, email, cb),
    ],
    callback
  )
}

const removeLegacyInvite = (subscriptionId, email, callback) =>
  Subscription.updateOne(
    {
      _id: new ObjectId(subscriptionId.toString()),
    },
    {
      $pull: {
        invited_emails: email,
      },
    },
    callback
  )

function checkIfInviteIsPossible(subscription, email, callback) {
  if (!subscription.groupPlan) {
    logger.debug(
      { subscriptionId: subscription.id },
      'can not add members to a subscription that is not in a group plan'
    )
    return callback(null, false, { wrongPlan: true })
  }

  if (LimitationsManager.teamHasReachedMemberLimit(subscription)) {
    logger.debug(
      { subscriptionId: subscription.id },
      'team has reached member limit'
    )
    return callback(null, false, { limitReached: true })
  }

  UserGetter.getUserByAnyEmail(email, function (error, existingUser) {
    if (error) {
      return callback(error)
    }
    if (!existingUser) {
      return callback(null, true)
    }

    const existingMember = subscription.member_ids.find(
      memberId => memberId.toString() === existingUser._id.toString()
    )

    if (existingMember) {
      logger.debug(
        { subscriptionId: subscription.id, email },
        'user already in team'
      )
      callback(null, false, { alreadyInTeam: true })
    } else {
      callback(null, true)
    }
  })
}

function getInviterName(inviter) {
  let inviterName
  if (inviter.first_name && inviter.last_name) {
    inviterName = `${inviter.first_name} ${inviter.last_name} (${inviter.email})`
  } else {
    inviterName = inviter.email
  }

  return inviterName
}
