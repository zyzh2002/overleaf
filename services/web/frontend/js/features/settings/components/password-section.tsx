import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  ControlLabel,
  FormControl,
  FormGroup,
} from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import {
  getUserFacingMessage,
  getErrorMessageKey,
  postJSON,
} from '../../../infrastructure/fetch-json'
import getMeta from '../../../utils/meta'
import { ExposedSettings } from '../../../../../types/exposed-settings'
import { PasswordStrengthOptions } from '../../../../../types/password-strength-options'
import useAsync from '../../../shared/hooks/use-async'

type PasswordUpdateResult = {
  message?: {
    text: string
  }
}

function PasswordSection() {
  const { t } = useTranslation()

  return (
    <>
      <h3>{t('change_password')}</h3>
      <PasswordInnerSection />
    </>
  )
}

function PasswordInnerSection() {
  const { t } = useTranslation()
  const { isOverleaf } = getMeta('ol-ExposedSettings') as ExposedSettings
  const isExternalAuthenticationSystemUsed = getMeta(
    'ol-isExternalAuthenticationSystemUsed'
  ) as boolean
  const hasPassword = getMeta('ol-hasPassword') as boolean

  if (isExternalAuthenticationSystemUsed && !isOverleaf) {
    return <p>{t('password_managed_externally')}</p>
  }

  if (!hasPassword) {
    return (
      <p>
        <a href="/user/password/reset" target="_blank">
          {t('no_existing_password')}
        </a>
      </p>
    )
  }

  return <PasswordForm />
}

function PasswordForm() {
  const { t } = useTranslation()
  const passwordStrengthOptions = getMeta(
    'ol-passwordStrengthOptions'
  ) as PasswordStrengthOptions

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword1, setNewPassword1] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const { isLoading, isSuccess, isError, data, error, runAsync } =
    useAsync<PasswordUpdateResult>()
  const [isNewPasswordValid, setIsNewPasswordValid] = useState(false)
  const [isFormValid, setIsFormValid] = useState(false)

  const handleCurrentPasswordChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCurrentPassword(event.target.value)
  }

  const handleNewPassword1Change = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setNewPassword1(event.target.value)
    setIsNewPasswordValid(event.target.validity.valid)
  }

  const handleNewPassword2Change = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setNewPassword2(event.target.value)
  }

  useEffect(() => {
    setIsFormValid(
      !!currentPassword && isNewPasswordValid && newPassword1 === newPassword2
    )
  }, [currentPassword, newPassword1, newPassword2, isNewPasswordValid])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isFormValid) {
      return
    }
    runAsync(
      postJSON('/user/password/update', {
        body: {
          currentPassword,
          newPassword1,
          newPassword2,
        },
      })
    ).catch(() => {})
  }

  return (
    <form id="password-change-form" onSubmit={handleSubmit}>
      <PasswordFormGroup
        id="current-password-input"
        label={t('current_password')}
        value={currentPassword}
        handleChange={handleCurrentPasswordChange}
        autoComplete="current-password"
      />
      <PasswordFormGroup
        id="new-password-1-input"
        label={t('new_password')}
        value={newPassword1}
        handleChange={handleNewPassword1Change}
        minLength={passwordStrengthOptions?.length?.min || 8}
        autoComplete="new-password"
      />
      <PasswordFormGroup
        id="new-password-2-input"
        label={t('confirm_new_password')}
        value={newPassword2}
        handleChange={handleNewPassword2Change}
        validationMessage={
          newPassword1 !== newPassword2 ? t('doesnt_match') : ''
        }
        autoComplete="new-password"
      />
      {isSuccess && data?.message?.text ? (
        <FormGroup>
          <Alert bsStyle="success">{data.message.text}</Alert>
        </FormGroup>
      ) : null}
      {isError ? (
        <FormGroup>
          <Alert bsStyle="danger">
            {getErrorMessageKey(error) === 'password-must-be-strong' ? (
              <>
                <Trans
                  i18nKey="password_was_detected_on_a_public_list_of_known_compromised_passwords"
                  components={[
                    /* eslint-disable-next-line jsx-a11y/anchor-has-content, react/jsx-key */
                    <a
                      href="https://haveibeenpwned.com"
                      target="_blank"
                      rel="noreferrer noopener"
                    />,
                  ]}
                />
                . {t('use_a_different_password')}
              </>
            ) : (
              getUserFacingMessage(error)
            )}
          </Alert>
        </FormGroup>
      ) : null}
      <Button
        form="password-change-form"
        type="submit"
        bsStyle="primary"
        disabled={isLoading || !isFormValid}
      >
        {isLoading ? <>{t('saving')}…</> : t('change')}
      </Button>
    </form>
  )
}

type PasswordFormGroupProps = {
  id: string
  label: string
  value: string
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  minLength?: number
  validationMessage?: string
  autoComplete?: string
}

function PasswordFormGroup({
  id,
  label,
  value,
  handleChange,
  minLength,
  validationMessage: parentValidationMessage,
  autoComplete,
}: PasswordFormGroupProps) {
  const [validationMessage, setValidationMessage] = useState('')
  const [hadInteraction, setHadInteraction] = useState(false)

  const handleInvalid = (
    event: React.InvalidEvent<HTMLInputElement & FormControl>
  ) => {
    event.preventDefault()
  }

  const handleChangeAndValidity = (
    event: React.ChangeEvent<HTMLInputElement & FormControl>
  ) => {
    handleChange(event)
    setHadInteraction(true)
    setValidationMessage(event.target.validationMessage)
  }

  return (
    <FormGroup>
      <ControlLabel htmlFor={id}>{label}</ControlLabel>
      <FormControl
        id={id}
        type="password"
        placeholder="*********"
        autoComplete={autoComplete}
        value={value}
        data-ol-dirty={!!validationMessage}
        onChange={handleChangeAndValidity}
        onInvalid={handleInvalid}
        required={hadInteraction}
        minLength={minLength}
      />
      {hadInteraction && (parentValidationMessage || validationMessage) ? (
        <span className="small text-danger">
          {parentValidationMessage || validationMessage}
        </span>
      ) : null}
    </FormGroup>
  )
}

export default PasswordSection
