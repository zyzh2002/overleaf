import PdfSynctexControls from '../../../../frontend/js/features/pdf-preview/components/pdf-synctex-controls'
import { cloneDeep } from 'lodash'
import { useDetachCompileContext as useCompileContext } from '../../../../frontend/js/shared/context/detach-compile-context'
import { useFileTreeData } from '../../../../frontend/js/shared/context/file-tree-data-context'
import { useEffect } from 'react'
import { EditorProviders } from '../../helpers/editor-providers'
import { mockScope } from './scope'
import { detachChannel, testDetachChannel } from '../../helpers/detach-channel'

const mockHighlights = [
  {
    page: 1,
    h: 85.03936,
    v: 509.999878,
    width: 441.921265,
    height: 8.855677,
  },
  {
    page: 1,
    h: 85.03936,
    v: 486.089539,
    width: 441.921265,
    height: 8.855677,
  },
]

type Position = {
  page: number
  offset: { top: number; left: number }
  pageSize: { height: number; width: number }
}

const mockPosition: Position = {
  page: 1,
  offset: { top: 10, left: 10 },
  pageSize: { height: 500, width: 500 },
}

type Entity = {
  type: string
}

const mockSelectedEntities: Entity[] = [{ type: 'doc' }]

const WithPosition = ({ mockPosition }: { mockPosition: Position }) => {
  const { setPosition } = useCompileContext()

  // mock PDF scroll position update
  useEffect(() => {
    setPosition(mockPosition)
  }, [mockPosition, setPosition])

  return null
}

// mock PDF scroll position update
const setDetachedPosition = (mockPosition: Position) => {
  testDetachChannel.postMessage({
    role: 'detacher',
    event: 'state-position',
    data: { value: mockPosition },
  })
}

const WithSelectedEntities = ({
  mockSelectedEntities = [],
}: {
  mockSelectedEntities: Entity[]
}) => {
  const { setSelectedEntities } = useFileTreeData()

  useEffect(() => {
    setSelectedEntities(mockSelectedEntities)
  }, [mockSelectedEntities, setSelectedEntities])

  return null
}

const interceptSyncCodeAsync = () => {
  const output: { resolve: () => void } = {
    resolve: () => {
      // do nothing
    },
  }

  cy.intercept('/project/*/sync/code?*', req => {
    return new Promise(resolve => {
      output.resolve = () => {
        req.reply({
          body: { pdf: cloneDeep(mockHighlights) },
        })
        resolve()
      }
    })
  }).as('sync-code')

  return output
}

const interceptSyncPdfAsync = () => {
  const output: { resolve: () => void } = {
    resolve: () => {
      // do nothing
    },
  }

  cy.intercept('/project/*/sync/pdf?*', req => {
    return new Promise(resolve => {
      output.resolve = () => {
        req.reply({
          body: { code: [{ file: 'main.tex', line: 100 }] },
          delay: 1,
        })
        resolve()
      }
    })
  }).as('sync-pdf')

  return output
}

const interceptSyncPdf = () => {
  cy.intercept('/project/*/sync/pdf?*', req => {
    req.reply({
      body: { code: [{ file: 'main.tex', line: 100 }] },
    })
  }).as('sync-pdf')
}

// eslint-disable-next-line mocha/no-skipped-tests
describe.skip('<PdfSynctexControls/>', function () {
  beforeEach(function () {
    window.metaAttributesCache = new Map()

    cy.interceptCompile()
    cy.interceptEvents()
  })

  afterEach(function () {
    window.metaAttributesCache = new Map()
  })

  it('handles clicks on sync buttons', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <WithPosition mockPosition={mockPosition} />
        <WithSelectedEntities mockSelectedEntities={mockSelectedEntities} />
        <PdfSynctexControls />
      </EditorProviders>
    )

    cy.get('.synctex-control-icon').should('have.length', 2)

    // mock editor cursor position update
    cy.window().then(win => {
      win.dispatchEvent(
        new CustomEvent('cursor:editor:update', {
          detail: { row: 100, column: 10 },
        })
      )
    })

    cy.wait('@compile').then(() => {
      setDetachedPosition(mockPosition)
    })

    const syncCode = interceptSyncCodeAsync()

    cy.findByRole('button', { name: 'Go to code location in PDF' }).click()
    cy.findByRole('button', { name: 'Go to code location in PDF' })
      .should('be.disabled')
      .then(() => {
        syncCode.resolve()
      })

    cy.wait('@sync-code')

    const syncPdf = interceptSyncPdfAsync()

    cy.findByRole('button', { name: /^Go to PDF location in code/ }).click()
    cy.findByRole('button', { name: /^Go to PDF location in code/ })
      .should('be.disabled')
      .then(() => {
        syncPdf.resolve()
      })

    cy.wait('@sync-pdf')
  })

  it('disables button when multiple entities are selected', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <WithPosition mockPosition={mockPosition} />
        <WithSelectedEntities
          mockSelectedEntities={[{ type: 'doc' }, { type: 'doc' }]}
        />
        <PdfSynctexControls />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Go to code location in PDF' }).should(
      'be.disabled'
    )
  })

  it('disables button when a file is selected', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <WithPosition mockPosition={mockPosition} />
        <WithSelectedEntities mockSelectedEntities={[{ type: 'file' }]} />
        <PdfSynctexControls />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Go to code location in PDF' }).should(
      'be.disabled'
    )
  })

  describe('with detacher role', function () {
    beforeEach(function () {
      window.metaAttributesCache.set('ol-detachRole', 'detacher')
    })

    it('does not have go to PDF location button nor arrow icon', function () {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <WithPosition mockPosition={mockPosition} />
          <WithSelectedEntities mockSelectedEntities={mockSelectedEntities} />
          <PdfSynctexControls />
        </EditorProviders>
      )

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'not.exist'
      )

      cy.get('.synctex-control-icon').should('not.exist')
    })

    it('send set highlights action', function () {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <WithPosition mockPosition={mockPosition} />
          <WithSelectedEntities mockSelectedEntities={mockSelectedEntities} />
          <PdfSynctexControls />
        </EditorProviders>
      )

      cy.wait('@compile')

      // mock editor cursor position update
      cy.window().then(win => {
        win.dispatchEvent(
          new CustomEvent('cursor:editor:update', {
            detail: { row: 100, column: 10 },
          })
        )
      })

      cy.spy(detachChannel, 'postMessage').as('postDetachMessage')

      const syncing = interceptSyncCodeAsync()

      cy.findByRole('button', {
        name: 'Go to code location in PDF',
      })
        .should('not.be.disabled')
        .click()

      cy.findByRole('button', {
        name: 'Go to code location in PDF',
      })
        .should('be.disabled')
        .then(() => {
          syncing.resolve()
        })

      cy.wait('@sync-code')

      cy.findByRole('button', {
        name: 'Go to code location in PDF',
      }).should('not.be.disabled')

      // synctex is called locally and the result are broadcast for the detached tab
      // NOTE: can't use `.to.deep.include({…})` as it doesn't match the nested array
      cy.get('@postDetachMessage').should('be.calledWith', {
        role: 'detacher',
        event: 'action-setHighlights',
        data: { args: [mockHighlights] },
      })
    })

    it('reacts to sync to code action', function () {
      interceptSyncPdf()

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <WithPosition mockPosition={mockPosition} />
          <WithSelectedEntities mockSelectedEntities={mockSelectedEntities} />
          <PdfSynctexControls />
        </EditorProviders>
      ).then(() => {
        testDetachChannel.postMessage({
          role: 'detached',
          event: 'action-sync-to-code',
          data: {
            args: [mockPosition],
          },
        })
      })

      cy.wait('@sync-pdf')
    })
  })

  describe('with detached role', function () {
    beforeEach(function () {
      window.metaAttributesCache.set('ol-detachRole', 'detached')
    })

    it('does not have go to code location button nor arrow icon', function () {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <WithPosition mockPosition={mockPosition} />
          <PdfSynctexControls />
        </EditorProviders>
      )

      cy.findByRole('button', {
        name: 'Go to code location in PDF',
      }).should('not.exist')

      cy.get('.synctex-control-icon').should('not.exist')
    })

    it('send go to code line action', function () {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfSynctexControls />
        </EditorProviders>
      )

      cy.wait('@compile').then(() => {
        testDetachChannel.postMessage({
          role: 'detacher',
          event: `state-position`,
          data: { value: mockPosition },
        })
      })

      cy.findByRole('button', {
        name: /^Go to PDF location in code/,
      })

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'not.be.disabled'
      )

      cy.spy(detachChannel, 'postMessage').as('postDetachMessage')

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).click()

      // the button is only disabled when the state is updated
      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'not.be.disabled'
      )

      cy.get('.synctex-spin-icon').should('not.exist')

      cy.get('@postDetachMessage').should('be.calledWith', {
        role: 'detached',
        event: 'action-sync-to-code',
        data: {
          args: [mockPosition, 72],
        },
      })
    })

    it('update inflight state', function () {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <WithPosition mockPosition={mockPosition} />
          <PdfSynctexControls />
        </EditorProviders>
      )

      cy.wrap(null).then(() => {
        testDetachChannel.postMessage({
          role: 'detacher',
          event: `state-position`,
          data: { value: mockPosition },
        })
      })

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'not.be.disabled'
      )

      cy.get('.synctex-spin-icon').should('not.exist')

      cy.wrap(null).then(() => {
        testDetachChannel.postMessage({
          role: 'detacher',
          event: 'state-sync-to-code-inflight',
          data: { value: true },
        })
      })

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'be.disabled'
      )

      cy.get('.synctex-spin-icon').should('have.length', 1)

      cy.wrap(null).then(() => {
        testDetachChannel.postMessage({
          role: 'detacher',
          event: 'state-sync-to-code-inflight',
          data: { value: false },
        })
      })

      cy.findByRole('button', { name: /^Go to PDF location in code/ }).should(
        'not.be.disabled'
      )

      cy.get('.synctex-spin-icon').should('not.exist')
    })
  })
})
