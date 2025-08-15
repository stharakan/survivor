# Software Development Ticket

## Ticket Header
- **Ticket ID**: PERF-003
- **Title**: Optimize Images for Mobile Performance
- **Type**: Performance
- **Priority**: Critical
- **Estimated Story Points**: 8

## User Story
As a mobile user, I want images to load quickly and efficiently so that I don't waste my mobile data allowance and experience faster page loads throughout the application.

## Description

### Current State
The Survivor League application has significant image optimization issues affecting mobile performance:

- **Main Logo**: 180KB PNG (`tharakan-bros-logo.png`) loaded on every page
  - Used in navbar (50x50px and 100x100px)
  - Appears on 16+ pages throughout the application
  - No modern format optimization (WebP/AVIF)
  
- **Team Logos**: External team logos loaded without optimization
  - Used with `<img>` tags instead of Next.js `Image` component
  - No lazy loading implementation
  - Fallback to `/placeholder.svg` when team logo unavailable

- **Next.js Image Configuration**: Basic setup exists but not optimally configured
  - Only configured for `resources.premierleague.com` domain
  - No format optimization specified
  - No quality or size optimization settings

### Impact
- 180KB logo downloaded on every page load
- Multiple unoptimized team logos on picks/scoreboard pages
- Significant mobile bandwidth usage
- Slower page loads on mobile networks

### Scope
This ticket focuses ONLY on:
- Logo format optimization (WebP/AVIF)
- Next.js Image component implementation
- Image lazy loading
- Basic image optimization configuration

This ticket does NOT include:
- Bundle optimization (PERF-002)
- Code splitting (PERF-004)
- API optimization (PERF-006)

## Acceptance Criteria

**AC1: Main Logo Optimization**
- Given: Current 180KB PNG logo is used across 16+ pages
- When: Logo is converted to WebP/AVIF with proper fallbacks
- Then: Logo file size is reduced by at least 70% while maintaining visual quality

**AC2: Next.js Image Component Implementation**
- Given: Logo currently uses standard `Image` import but could be optimized further
- When: All logo instances are properly configured with Next.js Image optimization
- Then: Images are served in optimal formats with responsive sizing

**AC3: Team Logo Optimization**
- Given: Team logos use `<img>` tags without optimization
- When: Team logo rendering is updated to use Next.js Image component
- Then: Team logos load with proper optimization and lazy loading

**AC4: Lazy Loading Implementation**
- Given: All images load immediately when page renders
- When: Below-the-fold images implement lazy loading
- Then: Only visible images load initially, improving initial page load time

**AC5: Image Configuration Enhancement**
- Given: Basic Next.js image config exists
- When: Configuration is enhanced with format optimization and quality settings
- Then: Images are automatically served in optimal formats based on browser support

**AC6: Fallback Image Optimization**
- Given: Placeholder images exist but may not be optimized
- When: Placeholder/fallback images are optimized
- Then: Even fallback scenarios use minimal bandwidth

**AC7: Mobile Performance Improvement**
- Given: Current image payload significantly impacts mobile load times
- When: All image optimizations are implemented
- Then: Total image payload is reduced by at least 70% on mobile devices

## Technical Requirements

### Image Assets
- Convert `tharakan-bros-logo.png` to WebP and AVIF formats
- Optimize existing placeholder images
- Create responsive variants for different screen densities
- Maintain PNG fallback for older browser compatibility

### Next.js Configuration
- Update `next.config.mjs` with advanced image optimization settings
- Configure format preferences (WebP, AVIF, PNG fallback)
- Set quality optimization levels
- Add responsive image breakpoints

### Component Updates
- Update navbar component logo implementation
- Replace `<img>` tags with `next/image` components for team logos
- Implement proper `alt` text for accessibility
- Add loading states for images

### File Structure
- Organize optimized images in logical directory structure
- Maintain backward compatibility with existing image paths
- Create multiple format variants in build process

## Definition of Done
- [ ] Main logo converted to WebP/AVIF with 70%+ size reduction
- [ ] All logo instances use optimized Next.js Image component
- [ ] Team logos converted from `<img>` to `next/image` with lazy loading
- [ ] Next.js image configuration optimized for mobile performance
- [ ] Placeholder images optimized
- [ ] Image loading performance improved by 70%+ on mobile
- [ ] All images maintain visual quality across devices
- [ ] Proper alt text implemented for accessibility
- [ ] No broken images or missing fallbacks
- [ ] Cross-browser compatibility tested
- [ ] Mobile device testing completed
- [ ] Performance testing shows measurable improvement
- [ ] Code review completed
- [ ] Documentation updated with image optimization guidelines

## Implementation Notes

### File Locations
- Main logo: `/public/images/tharakan-bros-logo.{webp,avif,png}`
- Navbar component: `/components/navbar.tsx` (lines 63, 131)
- Team logo usage: `/app/make-picks/page.tsx`, `/app/picks-remaining/page.tsx`
- Next.js config: `/next.config.mjs`
- Placeholder images: `/public/placeholder-*.{webp,svg}`

### Code Style
Follow existing patterns:
- Use `next/image` import consistently
- Maintain existing component prop patterns
- Keep current responsive breakpoint approach
- Follow existing error handling patterns

### Image Optimization Tools
```bash
# For development/build process
npm install sharp  # Next.js image optimization
```

### Next.js Configuration Updates
```javascript
// next.config.mjs additions
images: {
  unoptimized: false,
  domains: ['resources.premierleague.com'],
  formats: ['image/avif', 'image/webp'],
  minimumCacheTTL: 86400,
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  quality: 85,
}
```

### Component Pattern
```tsx
// Replace <img> with optimized Image
<Image
  src={team.logo || "/placeholder.svg"}
  alt={`${team.name} logo`}
  width={48}
  height={48}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### Asset Generation
1. Convert main logo using image optimization tools
2. Generate multiple format variants (WebP, AVIF, PNG)
3. Create appropriate sizes for different use cases (50x50, 100x100)
4. Optimize placeholder images

## Testing Strategy

### Visual Testing
- Compare image quality across different formats
- Test image loading on various devices and browsers
- Verify responsive image behavior at different breakpoints
- Confirm fallback images work correctly

### Performance Testing
- Measure image load times before and after optimization
- Test lazy loading behavior with slow network simulation
- Verify total page weight reduction
- Test mobile network performance (3G/4G)

### Functionality Testing
- Verify all images load correctly
- Test error handling when images fail to load
- Confirm accessibility with screen readers
- Test image caching behavior

### Cross-browser Testing
- Test WebP support in modern browsers
- Verify AVIF support where available
- Confirm PNG fallback works in older browsers
- Test mobile Safari, Chrome, Firefox compatibility

### Manual Testing Checklist
- [ ] Logo displays correctly in navbar across all pages
- [ ] Team logos load properly with lazy loading
- [ ] Images maintain quality at different screen sizes
- [ ] Fallback images work when primary images fail
- [ ] Loading states display appropriately
- [ ] No layout shifts during image loading
- [ ] Accessibility features work correctly

## Risk Assessment

### Technical Risks
- **Risk**: WebP/AVIF format compatibility issues
  - **Mitigation**: Implement proper fallback chain (AVIF → WebP → PNG)
- **Risk**: Image quality degradation during optimization
  - **Mitigation**: Test multiple quality settings, visual comparison testing
- **Risk**: Lazy loading may break user experience
  - **Mitigation**: Careful implementation with proper loading states

### Business Risks
- **Risk**: Brand logo quality concerns
  - **Mitigation**: Stakeholder approval of optimized logo versions
- **Risk**: User confusion from loading states
  - **Mitigation**: Smooth loading transitions, appropriate placeholders

### Performance Risks
- **Risk**: Over-optimization leading to poor quality
  - **Mitigation**: Balance between file size and visual quality
- **Risk**: Lazy loading implementation causing layout shifts
  - **Mitigation**: Proper aspect ratio maintenance, placeholder sizing

### Mitigation Plans
1. **Progressive Enhancement**: Implement with fallbacks for all scenarios
2. **A/B Testing**: Compare performance metrics before/after optimization
3. **Quality Assurance**: Visual review process for all optimized images
4. **Performance Monitoring**: Track image loading metrics post-deployment

## Related Resources

### Parent Epic
- [MOBILE_PERFORMANCE_EPIC.md](./MOBILE_PERFORMANCE_EPIC.md)

### Related Tickets
- PERF-002: Bundle Size Optimization (should be completed first)
- PERF-004: Code Splitting (may affect image loading patterns)
- PERF-010: PWA Implementation (image caching strategies)

### Technical Documentation
- [Next.js Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
- [WebP Browser Support](https://caniuse.com/webp)
- [AVIF Browser Support](https://caniuse.com/avif)

### Image Optimization Tools
- [Sharp.js](https://sharp.pixelplumbing.com/) - Next.js default image processor
- [Squoosh](https://squoosh.app/) - Manual image optimization tool
- [WebP Converter](https://developers.google.com/speed/webp)

### Performance Guidelines
- Target: <50KB for main logo across all formats
- Quality: Maintain 85% quality for WebP/AVIF
- Responsive: Serve appropriate sizes for device pixel density
- Accessibility: Ensure proper alt text and loading states