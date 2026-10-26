import { Suspense, lazy } from 'react';
import { useT } from '../i18n/I18nContext';

const LazyEloProgressChart = lazy(() => import('./EloProgressChartImpl'));

const EloProgressChart = (props) => {
  const t = useT();
  return (
    <Suspense fallback={<div className="chart-loading">{t('Loading Elo Chart...')}</div>}>
      <LazyEloProgressChart {...props} />
    </Suspense>
  );
};

export default EloProgressChart;
