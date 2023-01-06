import { EditorProviders } from '../../helpers/editor-providers'
import PdfJsViewer from '../../../../frontend/js/features/pdf-preview/components/pdf-js-viewer'
import { mockScope } from './scope'
import { getContainerEl } from 'cypress/react'
import { unmountComponentAtNode } from 'react-dom'

describe('<PdfJSViewer/>', function () {
  beforeEach(function () {
    cy.interceptCompile()
    cy.interceptEvents()
  })

  it('loads all PDF pages', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <div className="pdf-viewer">
          <PdfJsViewer url="/build/123/output.pdf" />
        </div>
      </EditorProviders>
    )

    cy.findByLabelText('Page 1')
    cy.findByLabelText('Page 2')
    cy.findByLabelText('Page 3')
    cy.findByLabelText('Page 4').should('not.exist')

    cy.contains('Your Paper')
  })

  it('renders pages in a "loading" state', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <div className="pdf-viewer">
          <PdfJsViewer url="/build/123/output.pdf" />
        </div>
      </EditorProviders>
    )

    cy.findByLabelText('Loading…')
  })

  it('can be unmounted while loading a document', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <div className="pdf-viewer">
          <PdfJsViewer url="/build/123/output.pdf" />
        </div>
      </EditorProviders>
    )

    cy.then(() => unmountComponentAtNode(getContainerEl()))
  })

  it('can be unmounted after loading a document', function () {
    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <div className="pdf-viewer">
          <PdfJsViewer url="/build/123/output.pdf" />
        </div>
      </EditorProviders>
    )

    cy.findByLabelText('Page 1')

    cy.then(() => unmountComponentAtNode(getContainerEl()))
  })
})
