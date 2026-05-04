import { useEffect } from 'react'

const LAST_UPDATED = 'May 4, 2026'
const BASE_TITLE = 'RiffSync'

export function TermsOfServicePage() {
  useEffect(() => {
    const previous = document.title
    document.title = `Terms of Service — ${BASE_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="riffsync-legal">
      <div className="container">
        <h1>Terms of Service</h1>
        <p className="riffsync-legal__meta text-muted">Last updated: {LAST_UPDATED}</p>

        <section>
          <h2>1. Agreement</h2>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of RiffSync
            (&ldquo;RiffSync,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;),
            including our website, watch-party features, catalogs, chat, and related services
            (collectively, the &ldquo;Service&rdquo;). By accessing or using the Service, you agree to
            these Terms. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. No affiliation with MST3K, RiffTrax, and related rights holders</h2>
          <p>
            RiffSync is an independent project. <strong>RiffSync is not affiliated with, endorsed by,
            sponsored by, or operated by</strong> <strong>Mystery Science Theater 3000</strong>{' '}
            (&ldquo;<strong>MST3K</strong>&rdquo;), <strong>RiffTrax</strong> (rifftrax.com and related
            offerings), or the companies that currently control MST3K-related intellectual property.
          </p>
          <p>
            <strong>MST3K.</strong> The MST3K name, characters, logos, episodes, and related
            intellectual property are owned by their respective rights holders. Public reporting in{' '}
            <strong>early 2026</strong> describes <strong>Radial Entertainment</strong>—the company
            formed from the combination of <strong>Shout! Studios</strong> and <strong>FilmRise</strong>
            —as having acquired MST3K brand assets and intellectual property from{' '}
            <strong>Alternaversal</strong>, following years in which MST3K was jointly controlled by
            Alternaversal and Shout! Studios. <strong>Nothing in these Terms grants you any license to
            MST3K marks or content.</strong> RiffSync claims no association with Radial Entertainment,
            Shout! Studios, FilmRise, Alternaversal, MST3K, or their parents, subsidiaries, affiliates,
            or licensees.
          </p>
          <p>
            <strong>RiffTrax.</strong> RiffTrax is a separate company and is <strong>not</strong> part of
            RiffSync; RiffSync has no partnership, license, or endorsement from RiffTrax. Industry
            coverage in 2024–2026 has described collaborations between RiffTrax and Shout! Studios on
            MST3K-branded programming; <strong>RiffSync is not a party to those projects.</strong>
          </p>
          <p>
            You agree not to represent that RiffSync is connected to MST3K, RiffTrax, or any of the
            entities named above. Third-party trademarks appear in these Terms only to describe
            RiffSync&rsquo;s independent, <strong>unaffiliated</strong> status.
          </p>
        </section>

        <section>
          <h2>3. The Service</h2>
          <p>
            RiffSync provides tools to browse a curated catalog, discover or join watch sessions,
            and—where enabled—host synchronized viewing with others. Playback for many titles relies
            on <strong>lawful embedding or linking</strong> to third-party hosts (for example,
            YouTube) subject to those platforms&rsquo; availability, geographic restrictions, embed
            rules, and takedowns. We do not guarantee uninterrupted access to any particular video or
            feature.
          </p>
        </section>

        <section>
          <h2>4. Eligibility and accounts</h2>
          <p>
            You must be able to form a binding contract in your jurisdiction to use parts of the
            Service that require registration or hosting. Some features may allow anonymous or
            pseudonymous participation (for example, guests in a room). Where you sign in through an
            identity provider (such as Amazon Cognito Hosted UI or Facebook Login), your use of that
            sign-in is also subject to the provider&rsquo;s terms and policies.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of credentials associated with
            your account and for activity under your account, except where we are at fault for
            unauthorized access.
          </p>
        </section>

        <section>
          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Use the Service for any unlawful purpose or in violation of applicable law or
              third-party rights.
            </li>
            <li>
              Attempt to interfere with, disrupt, or gain unauthorized access to the Service, other
              users, or underlying infrastructure.
            </li>
            <li>
              Harass, abuse, threaten, or harm other users, or post unlawful, defamatory, infringing,
              obscene, or excessively offensive material through chat or other features we provide.
            </li>
            <li>
              Circumvent technical measures, strip or block advertising where the underlying platform
              requires normal playback mechanics, or otherwise use the Service in a way that violates
              the rules of embedded or linked platforms (including YouTube&rsquo;s Terms of
              Service).
            </li>
            <li>
              Misrepresent your identity in a way that is likely to deceive others about your
              affiliation, or impersonate RiffSync or its staff.
            </li>
          </ul>
          <p>
            We may investigate and take appropriate action—including warning, suspending access, or
            removing content or accounts—if we believe you have violated these Terms or put the
            Service or others at risk.
          </p>
        </section>

        <section>
          <h2>6. User content</h2>
          <p>
            If you submit content through the Service (such as chat messages or display names), you
            retain your rights in that content. You grant RiffSync a non-exclusive, worldwide,
            royalty-free license to host, store, reproduce, and display that content solely as needed
            to operate and improve the Service (including moderation and safety). You represent
            that you have the rights necessary to grant this license.
          </p>
        </section>

        <section>
          <h2>7. Third-party services and attribution</h2>
          <p>
            The Service may integrate with or link to third-party services (for example, YouTube;
            The Movie Database (TMDB) for metadata or artwork; identity providers for authentication).
            Your use of those services is subject to their respective terms and policies. TMDB data
            and branding are used in accordance with{' '}
            <a
              href="https://www.themoviedb.org/documentation/api/terms-of-use"
              rel="noopener noreferrer"
            >
              TMDB&rsquo;s API terms
            </a>{' '}
            and attribution requirements where applicable.
          </p>
        </section>

        <section>
          <h2>8. Intellectual property</h2>
          <p>
            The RiffSync name, logo, software, and original materials we provide are owned by
            RiffSync or its licensors. Except for the limited rights expressly granted by these Terms
            or open-source licenses published for specific components, you receive no ownership
            interest in our intellectual property.
          </p>
        </section>

        <section>
          <h2>9. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED <strong>&ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo;</strong>{' '}
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RIFFSYNC DISCLAIMS ALL WARRANTIES, WHETHER
            EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
            FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL
            BE ERROR-FREE, SECURE, OR FREE OF HARMFUL COMPONENTS, OR THAT ANY VIDEO OR FEATURE WILL
            REMAIN AVAILABLE.
          </p>
        </section>

        <section>
          <h2>10. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RIFFSYNC AND ITS AFFILIATES, DIRECTORS,
            EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR
            OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE
            SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE OR
            OTHERWISE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US FOR THE SERVICE IN
            THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) FIFTY U.S. DOLLARS (US$50), IF NO FEES
            APPLY.
          </p>
          <p>
            Some jurisdictions do not allow certain limitations of liability; in those
            jurisdictions, our liability is limited to the fullest extent permitted by law.
          </p>
        </section>

        <section>
          <h2>11. Indemnity</h2>
          <p>
            You will defend, indemnify, and hold harmless RiffSync and its affiliates from and
            against any claims, damages, losses, liabilities, costs, and expenses (including
            reasonable attorneys&rsquo; fees) arising out of your use of the Service, your user
            content, or your violation of these Terms or applicable law.
          </p>
        </section>

        <section>
          <h2>12. Changes</h2>
          <p>
            We may modify these Terms from time to time. We will post the updated Terms on this page
            and update the &ldquo;Last updated&rdquo; date. Material changes may require additional
            notice where required by law. Continued use of the Service after changes become effective
            constitutes acceptance of the revised Terms, except where prohibited by law.
          </p>
        </section>

        <section>
          <h2>13. Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or terminate your access to
            the Service without notice if we reasonably believe you have violated these Terms, create
            risk or legal exposure for us, or for operational reasons. Provisions that by their
            nature should survive (including intellectual property, disclaimers, limitation of
            liability, indemnity, and governing law) will survive termination.
          </p>
        </section>

        <section>
          <h2>14. Governing law and disputes</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, USA, without regard to
            conflict-of-law principles, excluding its rules on choosing governing law. Courts in
            Delaware shall have exclusive jurisdiction over disputes, except that RiffSync may seek
            injunctive relief in any court of competent jurisdiction. If you are a consumer, you may
            have mandatory rights in your country of residence that cannot be waived; nothing in
            these Terms limits those rights.
          </p>
          <p className="text-muted">
            <strong>Note:</strong> Choice of law and venue are placeholders for product owners and
            counsel to align with entity location and user base.
          </p>
        </section>

        <section>
          <h2>15. Contact</h2>
          <p>
            For questions about these Terms, contact the RiffSync project maintainers through the
            channels listed on our public repository or website (for example via{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync" rel="noopener noreferrer">
              GitHub
            </a>
            ). Update this section with a dedicated legal or support address when one is available.
          </p>
        </section>
      </div>
    </div>
  )
}
