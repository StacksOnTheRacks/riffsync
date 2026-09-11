import { Link, Outlet } from 'react-router-dom'
import '../styles/fan-auth.css'

const LOGO_SRC = '/app-shell/topbar/logo.svg'

export function FanAuthLayout() {
  return (
    <div className="riffsync-fan-auth" data-testid="fan-auth-layout">
      <Link className="riffsync-fan-auth__logo" to="/" aria-label="RiffSync home">
        <img src={LOGO_SRC} alt="" width={99} height={39} />
      </Link>
      <div className="riffsync-fan-auth__card" data-testid="fan-auth-card">
        <Outlet />
      </div>
    </div>
  )
}
