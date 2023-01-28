import useDetachLayout from '../../../../frontend/js/shared/hooks/use-detach-layout'
import { detachChannel, testDetachChannel } from '../../helpers/detach-channel'
import { EditorProviders } from '../../helpers/editor-providers'
import { Button, Checkbox, ControlLabel, FormGroup } from 'react-bootstrap'

const DetachLayoutTest = () => {
  const { role, reattach, detach, isLinked, isLinking, isRedundant } =
    useDetachLayout()

  return (
    <fieldset>
      <legend>
        role: <span id="role">{role || 'none'}</span>
      </legend>
      <FormGroup>
        <Checkbox id="isLinked" inline checked={isLinked} readOnly />
        <ControlLabel>linked</ControlLabel>
      </FormGroup>
      <FormGroup>
        <Checkbox id="isLinking" inline checked={isLinking} readOnly />
        <ControlLabel>linking</ControlLabel>
      </FormGroup>
      <FormGroup>
        <Checkbox id="isRedundant" inline checked={isRedundant} readOnly />
        <ControlLabel>redundant</ControlLabel>
      </FormGroup>
      <Button id="reattach" onClick={reattach}>
        reattach
      </Button>
      <Button id="detach" onClick={detach}>
        detach
      </Button>
    </fieldset>
  )
}

// eslint-disable-next-line mocha/no-skipped-tests
describe.skip('useDetachLayout', function () {
  beforeEach(function () {
    window.metaAttributesCache = new Map()
    cy.stub(window, 'open').as('openWindow')
    cy.stub(window, 'close').as('closeWindow')
  })

  afterEach(function () {
    window.metaAttributesCache = new Map()
  })

  it('detaching', function () {
    // 1. create hook in normal mode
    cy.mount(
      <EditorProviders>
        <DetachLayoutTest />
      </EditorProviders>
    )

    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'none')

    // 2. detach
    cy.get('#detach').click()
    cy.get('@openWindow').should(
      'be.calledOnceWith',
      Cypress.sinon.match(/\/detached$/),
      '_blank'
    )
    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('be.checked')
    cy.get('#role').should('have.text', 'detacher')
  })

  it('detacher role', function () {
    // 1. create hook in detacher mode
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders>
        <DetachLayoutTest />
      </EditorProviders>
    )

    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detacher')

    cy.spy(detachChannel, 'postMessage').as('postDetachMessage')

    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'connected',
      })
    })

    // 2. simulate connected detached tab
    cy.get('@postDetachMessage').should('be.calledWith', {
      role: 'detacher',
      event: 'up',
    })

    cy.get('#isLinked').should('be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detacher')

    // 3. simulate closed detached tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'closed',
      })
    })
    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detacher')

    // 4. simulate up detached tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'up',
      })
    })

    cy.get('#isLinked').should('be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detacher')

    // 5. reattach
    cy.get('@postDetachMessage').invoke('resetHistory')
    cy.get('#reattach').click()

    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'none')
    cy.get('@postDetachMessage').should('be.calledWith', {
      role: 'detacher',
      event: 'reattach',
    })
  })

  it('reset detacher role when other detacher tab connects', function () {
    // 1. create hook in detacher mode
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders>
        <DetachLayoutTest />
      </EditorProviders>
    )

    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detacher')

    // 2. simulate other detacher tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detacher',
        event: 'up',
      })
    })

    cy.get('#isRedundant').should('be.checked')
    cy.get('#role').should('have.text', 'none')
  })

  it('detached role', function () {
    // 1. create hook in detached mode
    window.metaAttributesCache.set('ol-detachRole', 'detached')

    cy.mount(
      <EditorProviders>
        <DetachLayoutTest />
      </EditorProviders>
    )

    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')

    // 2. simulate up detacher tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detacher',
        event: 'up',
      })
    })

    cy.get('#isLinked').should('be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')

    // 3. simulate closed detacher tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detacher',
        event: 'closed',
      })
    })
    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')

    // 4. simulate up detacher tab
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detacher',
        event: 'up',
      })
    })
    cy.get('#isLinked').should('be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')

    // 5. simulate closed detached tab
    cy.spy(detachChannel, 'postMessage').as('postDetachMessage')
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detached',
        event: 'closed',
      })
    })
    cy.get('#isLinked').should('be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')
    cy.get('@postDetachMessage').should('be.calledWith', {
      role: 'detached',
      event: 'up',
    })

    // 6. simulate reattach event
    cy.get('@postDetachMessage').invoke('resetHistory')
    cy.wrap(null).then(() => {
      testDetachChannel.postMessage({
        role: 'detacher',
        event: 'reattach',
      })
    })
    cy.get('#isLinked').should('not.be.checked')
    cy.get('#isLinking').should('not.be.checked')
    cy.get('#role').should('have.text', 'detached')
    cy.get('@closeWindow').should('be.called')
  })
})
