import { fireEvent, screen, within } from '@testing-library/dom'
import { expect } from 'chai'
import SettingsDictionary from '../../../../../../frontend/js/features/editor-left-menu/components/settings/settings-dictionary'
import { renderWithEditorContext } from '../../../../helpers/render-with-context'

describe('<SettingsDictionary />', function () {
  it('open dictionary modal', function () {
    renderWithEditorContext(<SettingsDictionary />)

    screen.getByText('Dictionary')

    const button = screen.getByRole('button', { name: 'Edit' })
    fireEvent.click(button)

    const modal = screen.getAllByRole('dialog')[0]

    within(modal).getByRole('heading', { name: 'Edit Dictionary' })
    within(modal).getByText('Your custom dictionary is empty.')

    const doneButton = within(modal).getByRole('button', { name: 'Done' })
    fireEvent.click(doneButton)
    expect(screen.queryByRole('dialog')).to.be.null
  })
})
