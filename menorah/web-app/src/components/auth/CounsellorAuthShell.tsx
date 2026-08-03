import Link from 'next/link';
import ThemeToggle from '@/components/theme/ThemeToggle';
import styles from '@/app/login/page.module.css';

export default function CounsellorAuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.panelDeco1} />
        <div className={styles.panelDeco2} />

        <span className={styles.panelLogo}>
          <span className={styles.panelLogoIcon}>M</span>
          <span className={styles.panelLogoName}>Menorah Health</span>
        </span>

        <div className={styles.panelBody}>
          <p className={styles.panelEyebrow}>Counselor Portal</p>
          <h1 className={styles.panelHeading}>
            Secure access,
            <br />
            simple recovery.
          </h1>
          <figure className={styles.panelQuote}>
            <blockquote>
              <p className={styles.panelQuoteText}>
                Your password protects client conversations, appointments, and professional information.
              </p>
            </blockquote>
            <figcaption>
              <p className={styles.panelQuoteAuthor}>Menorah Health account security</p>
            </figcaption>
          </figure>
        </div>

        <p className={styles.panelFooter}>
          &copy; {new Date().getFullYear()} Menorah Health
        </p>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.themeToggle}>
          <ThemeToggle />
        </div>
        <Link href="/login" className={styles.mobileLogo}>
          <span className={styles.mobileLogoIcon}>M</span>
          <span className={styles.mobileLogoName}>Menorah Health</span>
        </Link>

        <div className={styles.formWrap}>
          <div className={styles.formInner}>{children}</div>
        </div>
      </div>
    </div>
  );
}
