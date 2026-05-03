import { Link } from 'react-router-dom'

export function SiteFooter() {
  return (
    <footer id="gen-footer">
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
                        Open-source fan catalog and watch parties for riff-style episodes—lawful
                        YouTube embeds, anonymous guests in watch rooms, and hosts who broadcast
                        over WebRTC.
                      </p>
                      <ul className="social-link">
                        <li>
                          <a
                            href="https://github.com/StacksOnTheRacks/riffsync"
                            rel="noopener noreferrer"
                          >
                            GitHub
                          </a>
                        </li>
                      </ul>
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
                        <Link to="/room/demo-room">Room (demo)</Link>
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
                        <Link to="/admin">Admin</Link>
                      </li>
                      <li className="menu-item">
                        <a href="https://riffsync.tv" rel="noopener noreferrer">
                          riffsync.tv
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-xl-3 col-md-6">
                <div className="widget">
                  <h4 className="footer-title">Contribute</h4>
                  <p>
                    RiffSync is built in public. Issues and pull requests on GitHub are the best
                    way to improve the catalog and watch experience.
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
                <span className="gen-copyright">© {new Date().getFullYear()} RiffSync</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
