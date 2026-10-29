import { useTranslation } from './index';

export function HomeLink() {
  const { t } = useTranslation();
  return <a className="home-link" href="./" title={t('common.home')}>← {t('common.home')}</a>;
}
