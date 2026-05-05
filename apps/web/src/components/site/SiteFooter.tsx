import { Link } from 'react-router-dom'

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const year = new Date().getFullYear()

  if (compact) {
    return (
      <footer id="gen-footer" className="riffsync-footer riffsync-footer--compact">
        <div className="gen-copyright-footer riffsync-footer--compact-inner">
          <div className="container">
            <nav className="riffsync-footer-compact-nav" aria-label="Footer">
              <span className="gen-copyright">© {year} RiffSync</span>
              <span aria-hidden className="riffsync-footer-compact-dot">
                ·
              </span>
              <Link to="/">Home</Link>
              <span aria-hidden>·</span>
              <Link to="/catalog">Catalog</Link>
              <span aria-hidden>·</span>
              <Link to="/lobby">Lobby</Link>
              <span aria-hidden>·</span>
              <Link to="/how-to-host-a-watchparty">Host help</Link>
              <span aria-hidden>·</span>
              <Link to="/privacy">Privacy</Link>
              <span aria-hidden>·</span>
              <Link to="/terms">Terms</Link>
            </nav>
            <p className="riffsync-footer-compact-contribute">
              <a href="https://github.com/StacksOnTheRacks/riffsync" rel="noopener noreferrer">
                Contribute on GitHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer id="gen-footer" className="riffsync-footer">
      <div className="gen-footer-style-1">
        <div className="gen-footer-top">
          <div className="container">
            <div className="row">
              <div className="col-xl-3 col-md-6">
                <div className="widget">
                  <div className="row">
                    <div className="col-sm-12">
                      <span className="riffsync-footer-wordmark">RiffSync</span>
                      <p>
                        A fan-built, open-source catalog and watch-party lounge for riff-style
                        episodes. Queue the cheesy feature, gather your crew in one room, and
                        stay on the same laugh track together. Host-friendly, guest-simple, and
                        grounded in lawful playback - no bone-shaped satellite required.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-xl-3 col-md-6">
                <div className="widget">
                  <h4 className="footer-title">Explore</h4>
                  <div className="menu-explore-container">
                    <ul className="menu">
                      <li className="menu-item">
                        <Link to="/">Home</Link>
                      </li>
                      <li className="menu-item">
                        <Link to="/catalog">Catalog</Link>
                      </li>
                      <li className="menu-item">
                        <Link to="/lobby">Lobby</Link>
                      </li>
                      <li className="menu-item">
                        <Link to="/how-to-host-a-watchparty">How to Host</Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-xl-3 col-md-6">
                <div className="widget">
                  <h4 className="footer-title">Project</h4>
                  <div className="menu-about-container">
                    <ul className="menu">
                      <li className="menu-item">
                        <Link to="/privacy">Privacy Policy</Link>
                      </li>
                      <li className="menu-item">
                        <Link to="/terms">Terms of Service</Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-xl-3 col-md-6">
                <div className="widget">
                  <h4 className="footer-title">Make it Better</h4>
                  <p>
                    RiffSync is built in public, by the fans, for the fans.{' '}
                    <a href="https://github.com/StacksOnTheRacks/riffsync/discussions" rel="noopener noreferrer">
                      Discussions on GitHub
                    </a>{' '}
                    are currently the best way to improve the catalog and watch experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="gen-copyright-footer">
          <div className="container">
            <div className="row">
              <div className="col-md-12 align-self-center">
                <span className="gen-copyright">© {year} RiffSync</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
