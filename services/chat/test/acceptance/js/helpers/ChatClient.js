import Request from 'request'

const request = Request.defaults({
  baseUrl: 'http://localhost:3010',
})

async function asyncRequest(options) {
  return new Promise((resolve, reject) => {
    request(options, (err, response, body) => {
      if (err) {
        reject(err)
      } else {
        resolve({ response, body })
      }
    })
  })
}

export async function sendGlobalMessage(projectId, userId, content) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/messages`,
    json: {
      user_id: userId,
      content,
    },
  })
}

export async function getGlobalMessages(projectId) {
  return asyncRequest({
    method: 'get',
    url: `/project/${projectId}/messages`,
    json: true,
  })
}

export async function sendMessage(projectId, threadId, userId, content) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/thread/${threadId}/messages`,
    json: {
      user_id: userId,
      content,
    },
  })
}

export async function getThreads(projectId) {
  return asyncRequest({
    method: 'get',
    url: `/project/${projectId}/threads`,
    json: true,
  })
}

export async function resolveThread(projectId, threadId, userId) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/thread/${threadId}/resolve`,
    json: {
      user_id: userId,
    },
  })
}

export async function editMessage(projectId, threadId, messageId, content) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/thread/${threadId}/messages/${messageId}/edit`,
    json: {
      content,
    },
  })
}

export async function editMessageWithUser(
  projectId,
  threadId,
  messageId,
  userId,
  content
) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/thread/${threadId}/messages/${messageId}/edit`,
    json: {
      content,
      userId,
    },
  })
}

export async function checkStatus() {
  return asyncRequest({
    method: 'get',
    url: `/status`,
    json: true,
  })
}

export async function getMetric(matcher) {
  const { body } = await asyncRequest({
    method: 'get',
    url: `/metrics`,
  })
  const found = body.split('\n').find(matcher)
  if (!found) return 0
  return parseInt(found.split(' ')[1], 0)
}

export async function reopenThread(projectId, threadId) {
  return asyncRequest({
    method: 'post',
    url: `/project/${projectId}/thread/${threadId}/reopen`,
  })
}

export async function deleteThread(projectId, threadId) {
  return asyncRequest({
    method: 'delete',
    url: `/project/${projectId}/thread/${threadId}`,
  })
}

export async function deleteMessage(projectId, threadId, messageId) {
  return asyncRequest({
    method: 'delete',
    url: `/project/${projectId}/thread/${threadId}/messages/${messageId}`,
  })
}

export async function destroyProject(projectId) {
  return asyncRequest({
    method: 'delete',
    url: `/project/${projectId}`,
  })
}
