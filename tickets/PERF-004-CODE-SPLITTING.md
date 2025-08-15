# Software Development Ticket

## Ticket Header
- **Ticket ID**: PERF-004
- **Title**: Implement Code Splitting and Route-Based Lazy Loading
- **Type**: Performance
- **Priority**: Critical
- **Estimated Story Points**: 13

## User Story
As a user, I want only the necessary code to load for the page I'm visiting so that the initial application load is faster and I don't download code for features I'm not using.

## Description

### Current State
The Survivor League application loads all components upfront without any code splitting implementation:

- **Admin Pages**: 5 admin pages (~1000 lines of code) loaded for all users
  - `/app/admin/page.tsx` - Main admin portal with complex state management
  - `/app/admin/members/[id]/page.tsx` - Member management
  - `/app/admin/settings/page.tsx` - League settings
  - `/app/admin/invitations/page.tsx` - Invitation management  
  - `/app/admin/requests/[id]/page.tsx` - Join request handling

- **Heavy Components**: Large components loaded upfront regardless of usage
  - Charts component (`recharts` dependency) - loaded even for non-chart pages
  - Multiple modal components (194 occurrences across 8 files)
  - Complex UI components loaded synchronously

- **No Dynamic Imports**: Zero usage of `React.lazy()` or `next/dynamic` in codebase
- **Heavy React Components**: 27 files with complex state management (useState/useEffect)

### Impact
- All users download admin code regardless of permissions
- Non-admin users (~90% of users) download unnecessary 200KB+ of admin functionality
- Charts and heavy components loaded on every page
- Initial bundle includes code for modals/overlays that may never be used

### Dependencies & Execution Order
This ticket should be implemented **AFTER** PERF-002 (Bundle Optimization) but can run **PARALLEL** to PERF-003 (Image Optimization).

**Reasoning**:
- PERF-002 establishes bundle analysis tooling needed to measure code splitting effectiveness
- PERF-003 is independent and can run concurrently
- This ticket's success depends on having proper bundle measurement tools

### Scope
This ticket focuses ONLY on:
- Admin route code splitting
- Heavy component lazy loading
- Modal/overlay dynamic imports
- Route-based code splitting

This ticket does NOT include:
- Bundle dependency optimization (PERF-002)
- Image optimization (PERF-003)
- API optimization (PERF-006)

## Acceptance Criteria

**AC1: Admin Route Code Splitting**
- Given: Admin pages are currently loaded for all users
- When: Dynamic imports are implemented for all admin routes
- Then: Admin code is only loaded when users navigate to admin routes, reducing non-admin user bundle size by 200KB+

**AC2: Chart Component Lazy Loading**
- Given: Chart component with recharts dependency loads upfront
- When: Chart component is converted to lazy loading
- Then: Charts only load when actually needed, reducing initial bundle by recharts dependency size

**AC3: Modal/Overlay Dynamic Loading**
- Given: Modal components are loaded synchronously across 8 files
- When: Heavy modals are converted to dynamic imports
- Then: Modal code is loaded on-demand when modals are triggered

**AC4: Loading States Implementation**
- Given: Dynamic imports need proper loading feedback
- When: Suspense boundaries and loading states are implemented
- Then: Users see appropriate loading indicators during code chunk downloads

**AC5: Route-Level Code Splitting**
- Given: All routes currently share the same bundle
- When: Route-based code splitting is implemented with Next.js
- Then: Each major route loads its specific code chunks independently

**AC6: Error Boundary Implementation**
- Given: Code splitting may introduce loading failures
- When: Error boundaries are implemented for dynamic imports
- Then: Failed chunk loads are handled gracefully with fallback UI

**AC7: Bundle Size Reduction**
- Given: Current bundle analysis baseline from PERF-002
- When: All code splitting is implemented
- Then: Initial bundle size is reduced by at least 40% for non-admin users

**AC8: Performance Metrics Improvement**
- Given: Current page load time baseline
- When: Code splitting is fully implemented
- Then: Time to Interactive (TTI) improves by at least 30% for initial page loads

## Technical Requirements

### Admin Route Splitting
- Convert all `/app/admin/*` pages to use `next/dynamic`
- Implement proper loading states for admin route chunks
- Ensure admin guards work correctly with lazy-loaded components
- Maintain existing admin functionality and routing

### Component-Level Splitting
- Convert chart component to lazy loading with React.lazy()
- Implement dynamic imports for heavy modal components
- Split components with complex state management (useState/useEffect)
- Create component-level Suspense boundaries

### Next.js Configuration
- Configure webpack chunk splitting strategy
- Implement proper chunk naming for debugging
- Set up chunk preloading for predicted navigation
- Configure chunk size optimization

### Error Handling
- Implement error boundaries for chunk loading failures
- Add retry mechanisms for failed chunk loads
- Provide fallback UI for loading errors
- Log chunk loading issues for monitoring

## Definition of Done
- [ ] All admin routes use dynamic imports with loading states
- [ ] Chart component implements lazy loading
- [ ] Heavy modal components use dynamic imports
- [ ] Suspense boundaries implemented with proper loading UI
- [ ] Error boundaries handle chunk loading failures
- [ ] Bundle analysis shows 40%+ reduction for non-admin users
- [ ] TTI improves by 30%+ on initial page loads
- [ ] All existing functionality works with code splitting
- [ ] Loading states provide good user experience
- [ ] Error handling prevents broken user flows
- [ ] Cross-browser testing confirms chunk loading works
- [ ] Performance testing validates improvements
- [ ] Code review completed
- [ ] Documentation updated with code splitting patterns

## Implementation Notes

### File Locations
- Admin routes: `/app/admin/*` (5 files)
- Chart component: `/components/ui/chart.tsx`
- Modal components: Files with Dialog/Sheet/Modal usage (8 files)
- Loading components: Create in `/components/ui/loading.tsx`
- Error boundaries: Create in `/components/error-boundary.tsx`

### Code Style
Follow existing Next.js and React patterns:
- Use `next/dynamic` for route-level splitting
- Use `React.lazy()` for component-level splitting
- Maintain existing prop interfaces
- Follow current error handling patterns

### Dynamic Import Patterns
```tsx
// Admin route splitting
const AdminPage = dynamic(() => import('./admin/page'), {
  loading: () => <AdminPageSkeleton />,
  ssr: false // Admin pages don't need SSR
})

// Component lazy loading
const ChartComponent = React.lazy(() => import('@/components/ui/chart'))

// Modal dynamic import
const TeamSelectionModal = dynamic(() => import('./team-selection-modal'), {
  loading: () => <ModalSkeleton />
})
```

### Suspense Implementation
```tsx
// Component-level suspense
<Suspense fallback={<ChartSkeleton />}>
  <ChartComponent {...props} />
</Suspense>

// Route-level suspense
<Suspense fallback={<PageSkeleton />}>
  <AdminRoutes />
</Suspense>
```

### Error Boundary Pattern
```tsx
<ErrorBoundary fallback={<ChunkLoadError onRetry={retryChunkLoad} />}>
  <LazyComponent />
</ErrorBoundary>
```

### Next.js Configuration Updates
```javascript
// next.config.mjs
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        admin: {
          test: /[\\/]app[\\/]admin[\\/]/,
          name: 'admin',
          priority: 30,
        },
        charts: {
          test: /[\\/]components[\\/]ui[\\/]chart/,
          name: 'charts',
          priority: 25,
        }
      }
    }
  }
  return config
}
```

## Testing Strategy

### Functionality Testing
- Verify all admin routes load correctly with code splitting
- Test chart components render properly when lazy loaded
- Confirm modal components work with dynamic imports
- Validate loading states display appropriately

### Performance Testing
- Measure bundle size reduction with webpack-bundle-analyzer
- Test TTI improvements on various devices
- Verify chunk loading times on slow networks
- Monitor memory usage with lazy loading

### Error Handling Testing
- Test chunk loading failures and retry mechanisms
- Verify error boundaries catch loading errors
- Test fallback UI displays correctly
- Confirm graceful degradation works

### User Experience Testing
- Test loading states provide good feedback
- Verify smooth transitions between code chunks
- Confirm no jarring loading experiences
- Test navigation feels responsive

### Cross-browser Testing
- Test dynamic imports work in all supported browsers
- Verify chunk loading in different network conditions
- Test error handling across browsers
- Confirm Suspense boundaries work correctly

## Risk Assessment

### Technical Risks
- **Risk**: Dynamic imports may break existing functionality
  - **Mitigation**: Comprehensive testing, gradual rollout, feature flags
- **Risk**: Code splitting may introduce loading delays
  - **Mitigation**: Preloading strategies, proper loading states, performance monitoring
- **Risk**: Chunk loading failures on poor networks
  - **Mitigation**: Retry mechanisms, error boundaries, fallback UI

### User Experience Risks
- **Risk**: Loading states may feel slow to users
  - **Mitigation**: Optimize chunk sizes, implement predictive loading
- **Risk**: Admin users may experience delays
  - **Mitigation**: Preload admin chunks for admin users, optimize loading times

### Performance Risks
- **Risk**: Over-splitting may create too many small chunks
  - **Mitigation**: Optimal chunk sizing strategy, bundle analysis monitoring
- **Risk**: Network overhead from multiple chunk requests
  - **Mitigation**: Intelligent chunk grouping, HTTP/2 multiplexing

### Mitigation Plans
1. **Gradual Implementation**: Roll out code splitting incrementally
2. **Performance Monitoring**: Track chunk loading metrics
3. **Fallback Strategies**: Ensure graceful degradation
4. **User Testing**: Validate loading experience with real users

## Related Resources

### Parent Epic
- [MOBILE_PERFORMANCE_EPIC.md](./MOBILE_PERFORMANCE_EPIC.md)

### Dependencies
- **MUST complete FIRST**: PERF-002 (Bundle Size Optimization) - provides bundle analysis tools
- **Can run in PARALLEL**: PERF-003 (Image Optimization) - independent scope

### Related Tickets
- PERF-002: Bundle Size Optimization (dependency - must complete first)
- PERF-003: Image Optimization (independent - can run parallel)
- PERF-005: CSS Optimization (may benefit from this ticket's patterns)

### Technical Documentation
- [Next.js Dynamic Imports](https://nextjs.org/docs/advanced-features/dynamic-import)
- [React.lazy and Suspense](https://reactjs.org/docs/code-splitting.html)
- [Webpack Code Splitting](https://webpack.js.org/guides/code-splitting/)

### Reference Implementations
- [Next.js Code Splitting Examples](https://github.com/vercel/next.js/tree/canary/examples/with-dynamic-import)
- [React Router Code Splitting](https://reactrouter.com/web/guides/code-splitting)

### Performance Tools
- webpack-bundle-analyzer (from PERF-002)
- Chrome DevTools Performance tab
- Lighthouse code splitting audits