import React, { useState } from 'react';

interface SimpleNavigationProps {
  currentPage: 'record' | 'jobs' | 'result' | 'prompts' | 'settings';
  onPageChange: (page: 'record' | 'jobs' | 'result' | 'prompts' | 'settings') => void;
  jobCount?: number;
  activeJobCount?: number;
  completedJobCount?: number;
}

export const SimpleNavigation: React.FC<SimpleNavigationProps> = ({ 
  currentPage, 
  onPageChange, 
  jobCount = 0, 
  activeJobCount = 0, 
  completedJobCount = 0 
}) => {
  const navItems = [
    {
      key: 'record' as const,
      label: '錄音',
      icon: '🎤'
    },
    {
      key: 'jobs' as const, 
      label: '任務',
      icon: '📋'
    },
    {
      key: 'result' as const,
      label: '結果', 
      icon: '📄'
    },
    {
      key: 'prompts' as const,
      label: '提示詞',
      icon: '🤖'
    },
    {
      key: 'settings' as const,
      label: '設定',
      icon: '⚙️'
    }
  ];

  return (
    <nav style={{
      backgroundColor: 'white',
      borderRight: '1px solid #e5e7eb',
      width: '200px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Header */}
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px', 
            backgroundColor: '#2563eb',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '12px'
          }}>
            🎤
          </div>
          <div>
            <h1 style={{ 
              fontSize: '18px', 
              fontWeight: 'bold', 
              color: '#111827', 
              margin: 0,
              marginBottom: '4px'
            }}>
              會議錄音
            </h1>
            <p style={{ 
              fontSize: '12px', 
              color: '#6b7280', 
              margin: 0 
            }}>
              Meeting Recorder
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <div style={{ padding: '0 1rem', flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navItems.map((item) => {
            const isActive = currentPage === item.key;
            
            return (
              <li key={item.key} style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => onPageChange(item.key)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: isActive ? '#dbeafe' : 'transparent',
                    color: isActive ? '#1e40af' : '#6b7280',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                      e.currentTarget.style.color = '#111827';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }
                  }}
                >
                  <span style={{ marginRight: '12px', fontSize: '16px' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  
                  {/* 顯示任務數量角標 */}
                  {item.key === 'jobs' && activeJobCount > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      minWidth: '18px',
                      textAlign: 'center'
                    }}>
                      {activeJobCount}
                    </span>
                  )}
                  
                  {/* 顯示完成數量角標 */}
                  {item.key === 'result' && completedJobCount > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: '#10b981',
                      color: 'white',
                      minWidth: '18px',
                      textAlign: 'center'
                    }}>
                      {completedJobCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Status Footer */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid #e5e7eb',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>模式</span>
          <span style={{
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 500,
            backgroundColor: '#fef3c7',
            color: '#92400e'
          }}>
            Mock
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>環境</span>
          <span style={{ textTransform: 'uppercase' }}>DEV</span>
        </div>
      </div>
    </nav>
  );
};