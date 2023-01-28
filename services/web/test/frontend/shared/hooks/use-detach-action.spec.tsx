import { FC } from 'react'
import useDetachAction from '../../../../frontend/js/shared/hooks/use-detach-action'
import { detachChannel, testDetachChannel } from '../../helpers/detach-channel'
import { EditorProviders } from '../../helpers/editor-providers'

const DetachActionTest: FC<{
  actionName: string
  actionFunction: () => void
  handleClick: (trigger: (value: any) => void) => void
}> = ({ actionName, actionFunction, handleClick }) => {
  const trigger = useDetachAction(
    actionName,
    actionFunction,
    'detacher',
    'detached'
  )

  return (
    <button id="trigger" onClick={() => handleClick(trigger)}>
      trigger
    </button>
  )
}

describe('useDetachAction', function () {
  beforeEach(function () {
    window.metaAttributesCache = new Map()
  })

  afterEach(function () {
    window.metaAttributesCache = new Map()
  })

  it('broadcast message as sender', function () {
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders>
        <DetachActionTest
          actionName="some-action"
          actionFunction={cy.stub().as('actionFunction')}
          handleClick={trigger => trigger('foo')}
        />
      </EditorProviders>
    )

    cy.spy(detachChannel, 'postMessage').as('postDetachMessage')
    cy.get('#trigger').click()
    cy.get('@postDetachMessage').should('be.calledWith', {
      role: 'detacher',
      event: 'action-some-action',
      data: { args: ['foo'] },
    })
    cy.get('@actionFunction').should('not.be.called')
  })

  it('call function as non-sender', function () {
    cy.mount(
      <EditorProviders>
        <DetachActionTest
          actionName="some-action"
          actionFunction={cy.stub().as('actionFunction')}
          handleClick={trigger => trigger('foo')}
        />
      </EditorProviders>
    )

    cy.spy(detachChannel, 'postMessage').as('postDetachMessage')
    cy.get('#trigger').click()
    cy.get('@postDetachMessage').should('not.be.called')
    cy.get('@actionFunction').should('be.calledWith', 'foo')
  })

  it('receive message and call function as target', function () {
    window.metaAttributesCache.set('ol-detachRole', 'detached')

    cy.mount(
      <EditorProviders>
        <DetachActionTest
          actionName="some-action"
          actionFunction={cy.stub().as('actionFunction')}
          handleClick={trigger => trigger('foo')}
        />
      </EditorProviders>
    )

    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'action-some-action',
        data: { args: ['foo'] },
      })
    })

    cy.get('@actionFunction').should('be.calledWith', 'foo')
  })

  it('receive message and does not call function as non-target', function () {
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders>
        <DetachActionTest
          actionName="some-action"
          actionFunction={cy.stub().as('actionFunction')}
          handleClick={trigger => trigger('foo')}
        />
      </EditorProviders>
    )

    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'action-some-action',
        data: { args: [] },
      })
    })

    cy.get('@actionFunction').should('not.be.called')
  })
})
