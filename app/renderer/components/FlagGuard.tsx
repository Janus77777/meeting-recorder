import React from 'react';
import { FeatureFlag, isFeatureEnabled, FEATURE_DESCRIPTIONS } from '@shared/flags';

interface FlagGuardProps {
  flag: FeatureFlag;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showPlaceholder?: boolean;
}

export const FlagGuard: React.FC<FlagGuardProps> = ({
  flag,
  children,
  fallback,
  showPlaceholder = true
}) => {
  const enabled = isFeatureEnabled(flag);

  if (enabled) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showPlaceholder) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <div className="text-gray-400 mb-2">
          <svg
            className="w-12 h-12 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">即將推出</h3>
        <p className="text-xs text-gray-500">
          {FEATURE_DESCRIPTIONS[flag]}
        </p>
      </div>
    );
  }

  return null;
};