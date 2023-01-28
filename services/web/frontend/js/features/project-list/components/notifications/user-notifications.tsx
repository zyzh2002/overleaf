import Common from './groups/common'
import Institution from './groups/institution'
import ConfirmEmail from './groups/confirm-email'
import ReconfirmationInfo from './groups/affiliation/reconfirmation-info'
import GroupsAndEnterpriseBanner from './groups-and-enterprise-banner'
import NewUsersMicroSurvey from './new-users-micro-survey'

function UserNotifications() {
  return (
    <div className="user-notifications">
      <ul className="list-unstyled">
        <Common />
        <Institution />
        <ConfirmEmail />
        <ReconfirmationInfo />
        <GroupsAndEnterpriseBanner />
        <NewUsersMicroSurvey />
      </ul>
    </div>
  )
}

export default UserNotifications
