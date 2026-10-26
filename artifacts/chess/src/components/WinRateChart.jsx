import { Suspense, lazy } from 'react';
import { useT } from '../i18n/I18nContext';

const LazyWinRateChart = lazy(() => import('./WinRateChartImpl'));

const WinRateChart = (props) => {
  const t = useT();
  return (
    <Suspense fallback={<div className="chart-loading">{t('Loading Win Rate Chart...')}</div>}>
      <LazyWinRateChart {...props} />
    </Suspense>
  );
};

export default WinRateChart;
