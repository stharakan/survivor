# Software Development Ticket

## Ticket Header
- **Ticket ID**: PERF-002
- **Title**: Optimize Bundle Size and Dependencies for Mobile Performance
- **Type**: Performance
- **Priority**: Critical
- **Estimated Story Points**: 21

## User Story
As a mobile user, I want the application to load quickly so that I can access my survivor picks without long wait times caused by large JavaScript bundles.

## Description

### Current State
The Survivor League application has significant bundle size issues impacting mobile performance:

- **39+ Radix UI components** are included in dependencies with 32 files importing from `@radix-ui/*`
- **Heavy dependencies contributing to bundle bloat**:
  - `recharts@2.15.0` (~500KB) - Only used in 1 file (`components/ui/chart.tsx`)
  - `date-fns@4.1.0` (~200KB) - Used in 4 files for basic date formatting
  - `lucide-react@0.454.0` (~300KB) - Large icon library with full import
- **No bundle analysis tooling** to monitor and track size growth
- **Inefficient imports** causing entire libraries to be bundled

### Scope Limitation
This ticket focuses ONLY on:
- Bundle analysis setup and monitoring
- Dependency optimization and replacement
- Tree-shaking configuration
- Import optimization

This ticket does NOT include:
- Code splitting (covered in PERF-004)
- Image optimization (covered in PERF-003)
- API optimization (covered in PERF-006)
- CSS optimization (covered in PERF-005)

### Impact
- Current estimated bundle size: >2MB compressed
- Mobile load times significantly impacted by JavaScript download and parsing
- Poor user experience on slow mobile networks

## Acceptance Criteria

**AC1: Bundle Analysis Setup**
- Given: No current bundle monitoring exists
- When: Bundle analyzer is integrated into the build process
- Then: Bundle analysis reports are generated showing current dependency sizes and can track future changes

**AC2: Radix UI Tree-Shaking**
- Given: 39+ Radix UI components are in dependencies but not all used
- When: Unused Radix components are identified and tree-shaking is optimized
- Then: Only actually imported and used Radix components appear in the final bundle

**AC3: Heavy Dependency Replacement**
- Given: recharts (500KB) is used only for basic charts in 1 component
- When: recharts is replaced with a lighter charting solution or native implementation
- Then: Chart dependency size is reduced by at least 80%

**AC4: Date Library Optimization**
- Given: date-fns (200KB) is used in 4 files for basic formatting
- When: date-fns usage is optimized with selective imports or replaced with native Date/Intl APIs
- Then: Date formatting dependency size is reduced by at least 70%

**AC5: Icon Library Optimization**
- Given: lucide-react imports the entire icon library
- When: Icon imports are optimized to only include used icons
- Then: Icon library bundle size is reduced by at least 60%

**AC6: Overall Bundle Size Reduction**
- Given: Current baseline bundle size is measured
- When: All dependency optimizations are implemented
- Then: Total JavaScript bundle size is reduced by at least 50%

## Technical Requirements

### Bundle Analysis
- Install and configure `@next/bundle-analyzer`
- Set up webpack bundle analysis in build process
- Create npm scripts for bundle analysis
- Generate size comparison reports

### Dependency Optimization
- **recharts**: Replace with lighter alternative (`victory`, `nivo`) or custom SVG charts
- **date-fns**: Replace with selective imports (`date-fns/format`, `date-fns/parseISO`) or native `Intl.DateTimeFormat`
- **lucide-react**: Implement tree-shaking friendly imports
- **Radix UI**: Audit actual usage and remove unused components

### Build Configuration
- Configure webpack for optimal tree-shaking
- Update Next.js config for dependency optimization
- Implement proper package optimization flags

## Definition of Done
- [ ] Bundle analyzer integrated and working
- [ ] Current bundle size baseline documented
- [ ] recharts dependency optimized (80% size reduction)
- [ ] date-fns dependency optimized (70% size reduction)  
- [ ] lucide-react imports optimized (60% size reduction)
- [ ] Unused Radix UI components identified and tree-shaken
- [ ] Overall bundle size reduced by minimum 50%
- [ ] Bundle analysis reports integrated into build process
- [ ] No functionality broken by dependency changes
- [ ] Unit tests pass with optimized dependencies
- [ ] Documentation updated with dependency optimization guidelines
- [ ] Code review completed

## Implementation Notes

### File Locations
- Bundle config: `next.config.mjs`
- Chart component: `components/ui/chart.tsx`
- Date usage files: `app/make-picks/page.tsx`, `app/profile/page.tsx`, `lib/game-utils.ts`, `app/player/[id]/page.tsx`
- Icon optimization: Throughout `components/` and `app/` directories

### Dependencies to Add
```json
{
  "@next/bundle-analyzer": "^15.0.0"
}
```

### Dependencies to Replace/Optimize
- `recharts` → Custom charts or `victory` (if charts needed)
- `date-fns` → Selective imports or native `Intl`
- `lucide-react` → Tree-shaking friendly imports

### Configuration Changes
Update `next.config.mjs`:
```javascript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // existing config...
  experimental: {
    optimizePackageImports: ['lucide-react']
  }
})
```

## Testing Strategy

### Functionality Testing
- Verify charts still render correctly after recharts replacement
- Test date formatting displays properly with new implementation
- Confirm all icons display correctly with optimized imports
- Validate Radix UI components work after tree-shaking

### Bundle Testing
- Run bundle analyzer before and after optimizations
- Verify bundle size reduction targets are met
- Test bundle loads correctly in production build
- Confirm no unused code appears in final bundle

### Performance Testing
- Measure JavaScript parsing time improvements
- Test mobile load times with optimized bundle
- Verify no runtime errors from dependency changes

## Risk Assessment

### Technical Risks
- **Risk**: Replacing recharts may break chart functionality
  - **Mitigation**: Implement feature parity testing, maintain same API where possible
- **Risk**: Date formatting changes may affect display
  - **Mitigation**: Comprehensive formatting tests, gradual migration
- **Risk**: Tree-shaking may remove needed components
  - **Mitigation**: Thorough usage analysis, testing

### Mitigation Plans
- Maintain backward compatibility where possible
- Implement comprehensive testing for all changed components
- Create rollback plan for each dependency change
- Monitor for runtime errors after deployment

## Related Resources

### Parent Epic
- [MOBILE_PERFORMANCE_EPIC.md](./MOBILE_PERFORMANCE_EPIC.md)

### Related but Separate Tickets  
- PERF-004: Code Splitting (handles route-level splitting)
- PERF-003: Image Optimization (handles asset optimization)
- PERF-006: API Optimization (handles data fetching)

### Technical References
- [Next.js Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)
- [Tree-shaking Guide](https://webpack.js.org/guides/tree-shaking/)
- [Lucide React Tree-shaking](https://lucide.dev/guide/packages/lucide-react#tree-shaking)