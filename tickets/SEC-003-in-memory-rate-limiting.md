# In-Memory Rate Limiting Implementation

**Ticket ID**: SEC-003
**Title**: Implement In-Memory Rate Limiting for API Protection
**Type**: Security Enhancement
**Priority**: High
**Estimated Story Points**: 5

## User Story

As a **platform operator**, I want to **implement rate limiting on API endpoints** so that **the application is protected from brute force attacks, API abuse, and accidental infinite loops while maintaining zero external dependencies**.

## Description

### Context and Background
Following the security analysis, the application currently lacks rate limiting protection, making it vulnerable to:
- Brute force attacks on authentication endpoints
- API abuse and excessive usage
- Accidental infinite loops from frontend applications
- Basic bot traffic and automated attacks

### Current State vs. Desired State
- **Current**: No rate limiting - unlimited requests to all API endpoints
- **Desired**: In-memory rate limiting with different tiers for different endpoint categories

### Technical Considerations
Based on codebase analysis:
- Next.js 15 with App Router and Edge Runtime middleware
- Existing middleware.ts handles authentication
- Small production application with infrequent deployments
- Zero external dependencies preferred for operational simplicity
- Serverless-friendly approach needed

### Constraints and Dependencies
- Must integrate with existing `middleware.ts` authentication flow
- Should not require external services (Redis, databases)
- Must work with Edge Runtime limitations
- Should handle memory management automatically
- No dependencies on other tickets

## Acceptance Criteria

**AC1: Authentication Endpoint Protection**
- Given: A client makes multiple requests to `/api/auth/login` or `/api/auth/register`
- When: The client exceeds 5 requests within 15 minutes
- Then: Subsequent requests return 429 status with appropriate headers and retry-after information

**AC2: League Endpoint Rate Limiting**
- Given: A client makes requests to league-scoped endpoints (`/api/leagues/*`)
- When: The client exceeds 30 requests within 5 minutes
- Then: Subsequent requests are blocked with 429 status

**AC3: General API Rate Limiting**
- Given: A client makes requests to other API endpoints
- When: The client exceeds 100 requests within 15 minutes
- Then: Subsequent requests are blocked with proper rate limit headers

**AC4: Rate Limit Reset After Window**
- Given: A client has been rate limited
- When: The time window expires (15 minutes for auth, 5 minutes for leagues)
- Then: The client can make requests again within the new window

**AC5: Memory Management**
- Given: The rate limiter has been running for extended periods
- When: Memory usage needs to be controlled
- Then: Expired entries are automatically cleaned up and memory usage remains bounded

**AC6: IP Address Identification**
- Given: Requests come through proxies or load balancers
- When: The middleware extracts client identification
- Then: Real IP addresses are used from `x-forwarded-for` and `x-real-ip` headers

**AC7: Rate Limit Headers**
- Given: A client makes API requests (both allowed and blocked)
- When: The response is returned
- Then: Appropriate rate limit headers are included (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`)

**AC8: Graceful Failure**
- Given: The rate limiting logic encounters an error
- When: An exception occurs in rate limit checking
- Then: The request is allowed to proceed (fail-open) and the error is logged

## Technical Requirements

### Architecture
- **Integration**: Enhance existing `middleware.ts` with rate limiting logic before authentication checks
- **Storage**: In-memory Map-based storage with automatic cleanup
- **Categories**: Different rate limits for auth, league, and general API endpoints

### Backend Changes
- **New File**: `lib/rate-limiter.ts` - Core rate limiting logic and data structures
- **Modified File**: `middleware.ts` - Integration with existing authentication flow
- **No Database Changes**: Purely in-memory solution

### APIs
- **No New Endpoints**: Rate limiting is transparent to API consumers
- **Response Headers**: Add standard rate limiting headers to all API responses
- **Error Responses**: 429 status with consistent error format using existing `createApiResponse`

### Testing
- **Unit Tests**: Rate limiting logic, cleanup mechanisms, key generation
- **Integration Tests**: Middleware integration with various endpoint types
- **Load Testing**: Memory usage under sustained load

### Documentation
- **README Updates**: Document rate limiting behavior and configuration
- **API Documentation**: Update with rate limit information and headers

## Definition of Done

- [ ] Code implementation follows project TypeScript and Next.js patterns
- [ ] Unit tests written covering all rate limiting scenarios (minimum 90% coverage)
- [ ] Integration tests validate middleware behavior with rate limiting
- [ ] Memory leak testing confirms proper cleanup of expired entries
- [ ] Manual testing confirms rate limiting works across all endpoint categories
- [ ] Performance testing shows minimal latency impact (<1ms per request)
- [ ] Code reviewed and approved by team lead
- [ ] Security review confirms protection against brute force attacks
- [ ] Documentation updated in README and API docs
- [ ] Error handling gracefully fails open if rate limiter encounters issues
- [ ] Rate limit headers properly returned in all scenarios

## Implementation Notes

### Code Style
- **Patterns**: Follow existing middleware patterns and TypeScript conventions
- **Error Handling**: Use existing `createApiResponse` for consistent error responses
- **Logging**: Minimal logging to avoid performance impact, error-only logging

### File Locations
- **Primary Implementation**: `lib/rate-limiter.ts` - Core logic and interfaces
- **Integration Point**: `middleware.ts` - Add rate limiting before authentication
- **Types**: Extend existing `lib/api-types.ts` if needed for rate limit types

### Naming Conventions
- **Functions**: `checkRateLimit`, `getClientIP`, `getEndpointCategory`
- **Interfaces**: `RateLimitEntry`, `RateLimitResult`, `RateLimitConfig`
- **Constants**: `RATE_LIMITS`, `MAX_ENTRIES`, `CLEANUP_THRESHOLD`

### Dependencies
- **Zero New Dependencies**: Use only built-in Node.js and Next.js APIs
- **TypeScript**: Leverage existing TypeScript configuration
- **Testing**: Use existing testing patterns (if any) or implement simple test cases

### Migration Strategy
- **Deployment**: Code-only changes, no infrastructure requirements
- **Rollout**: Can be deployed incrementally by enabling/disabling in middleware
- **Monitoring**: Log rate limit violations to identify abuse patterns

### Rollback Plan
- **Simple Revert**: Comment out rate limiting logic in middleware
- **Feature Flag**: Implement simple boolean flag to disable rate limiting
- **No Data Loss**: In-memory storage means no persistent data to manage

## Testing Strategy

### Unit Tests
```typescript
describe('Rate Limiter', () => {
  test('allows requests under limit')
  test('blocks requests over limit')
  test('resets after time window expires')
  test('cleans up expired entries')
  test('handles different endpoint categories')
  test('generates correct IP-based keys')
  test('returns proper rate limit headers')
  test('fails gracefully on errors')
})
```

### Integration Tests
- **Middleware Integration**: Test rate limiting with authentication flow
- **Endpoint Categories**: Verify different limits for auth vs league vs general APIs
- **Header Validation**: Confirm proper rate limit headers in responses
- **Edge Cases**: Test with missing IP headers, malformed requests

### Performance Tests
- **Memory Usage**: Monitor memory growth under load
- **Latency Impact**: Measure request processing time with rate limiting
- **Cleanup Efficiency**: Test automatic cleanup under various loads

### Manual Testing
- **Brute Force Simulation**: Attempt rapid login requests
- **API Hammering**: Test sustained requests to league endpoints
- **Recovery Testing**: Verify access restoration after rate limit windows

## Risk Assessment

### Technical Risks
- **Memory Leaks**: Unbounded growth of rate limit entries
- **Mitigation**: Implement automatic cleanup and maximum entry limits

- **Performance Impact**: Additional processing time for each request
- **Mitigation**: Optimize data structures, use efficient algorithms

### Business Risks
- **False Positives**: Legitimate users blocked behind shared IPs
- **Mitigation**: Set reasonable limits, provide clear error messages with retry times

- **User Experience**: Confusion when rate limited
- **Mitigation**: Clear error messages with retry-after information

### Security Risks
- **Bypass Attempts**: Attempts to circumvent IP-based rate limiting
- **Mitigation**: Monitor for abuse patterns, consider additional identification methods

- **DoS on Rate Limiter**: Overwhelming the rate limiting system itself
- **Mitigation**: Bounded memory usage, fail-open design

### Mitigation Plans
- **Monitoring**: Log rate limit violations to identify attack patterns
- **Alerting**: Monitor memory usage and performance metrics
- **Tuning**: Ability to adjust limits based on observed usage patterns

## Related Resources

- **Security Analysis**: Previous findings on missing rate limiting protection
- **Existing Middleware**: `middleware.ts` - Current authentication implementation
- **API Patterns**: `lib/api-types.ts` - Error response formatting
- **Similar Security Fixes**: SEC-001 (user authorization) and SEC-002 (league membership)

---

## Implementation Checklist

### Phase 1: Core Rate Limiting Logic
- [ ] Create `lib/rate-limiter.ts` with core interfaces and logic
- [ ] Implement rate limit checking algorithm
- [ ] Add memory cleanup mechanisms
- [ ] Create unit tests for core logic

### Phase 2: Middleware Integration
- [ ] Modify `middleware.ts` to integrate rate limiting
- [ ] Add IP extraction and endpoint categorization
- [ ] Implement proper error responses with headers
- [ ] Test middleware integration

### Phase 3: Testing and Validation
- [ ] Comprehensive unit test coverage
- [ ] Integration testing with existing authentication
- [ ] Performance and memory testing
- [ ] Manual security testing

### Phase 4: Documentation and Deployment
- [ ] Update README with rate limiting information
- [ ] Document API rate limit headers
- [ ] Deploy and monitor for issues
- [ ] Fine-tune limits based on real usage

This ticket provides a comprehensive roadmap for implementing production-ready in-memory rate limiting while maintaining the simplicity and zero-dependency approach suitable for a small-scale survivor league application.