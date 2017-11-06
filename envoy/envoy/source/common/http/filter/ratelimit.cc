#include "common/http/filter/ratelimit.h"

#include <string>
#include <vector>

#include "envoy/http/codes.h"

#include "common/common/assert.h"
#include "common/common/enum_to_int.h"
#include "common/http/codes.h"
#include "common/router/config_impl.h"
#include "common/common/logger.h"

#include "fmt/format.h"

namespace Envoy {
namespace Http {
namespace RateLimit {

namespace {

static const Http::HeaderMap* getTooManyRequestsHeader() {
  static const Http::HeaderMap* header_map = new Http::HeaderMapImpl{
      {Http::Headers::get().Status, std::to_string(enumToInt(Code::TooManyRequests))}};
  return header_map;
}

} // namespace

void Filter::initiateCall(const HeaderMap& headers) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Entering!");

  bool is_internal_request =
      headers.EnvoyInternalRequest() && (headers.EnvoyInternalRequest()->value() == "true");

  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: is_internal_request {}",is_internal_request);

  if ((is_internal_request && config_->requestType() == FilterRequestType::External) ||
      (!is_internal_request && config_->requestType() == FilterRequestType::Internal)) {
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Call type mismatch");
    return;
  }

  Router::RouteConstSharedPtr route = callbacks_->route();
  if (!route || !route->routeEntry()) {
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: No route entry");
    return;
  }

  const Router::RouteEntry* route_entry = route->routeEntry();
  Upstream::ThreadLocalCluster* cluster = config_->cm().get(route_entry->clusterName());
  if (!cluster) {
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: No cluster");
    return;
  }
  cluster_ = cluster->info();

  std::vector<Envoy::RateLimit::Descriptor> descriptors;

  // Get all applicable rate limit policy entries for the route.
  populateRateLimitDescriptors(route_entry->rateLimitPolicy(), descriptors, route_entry, headers);

  // Get all applicable rate limit policy entries for the virtual host if the route opted to
  // include the virtual host rate limits.
  if (route_entry->includeVirtualHostRateLimits()) {
    populateRateLimitDescriptors(route_entry->virtualHost().rateLimitPolicy(), descriptors,
                                 route_entry, headers);
  }

  if (!descriptors.empty()) {
    state_ = State::Calling;
    initiating_call_ = true;
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Initiating call x");

    // Log descriptor contents.
    size_t n = 1;
    for(std::vector<Envoy::RateLimit::Descriptor>::iterator it = descriptors.begin(); it != descriptors.end(); ++it) {
      ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Descriptor #{}",n);
      size_t nn = 1;
      for(std::vector<Envoy::RateLimit::DescriptorEntry>::iterator it2 = it->entries_.begin(); it2 != it->entries_.end(); ++it2) {
        ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Descriptor #{}, Entry #{}, key={} value={}",n,nn,it2->key_,it2->value_);        
      }
    }

    // ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Initiating call domain={}, descriptors={}, active_span={}",
    //   config_->domain(),
    //   descriptors,
    //   callbacks_->activeSpan()
    // );
    client_->limit(*this, config_->domain(), descriptors, callbacks_->activeSpan());
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Call done x");
    initiating_call_ = false;
  } else {
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Descriptors are empty");
  }
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::initiateCall: Done");
}

FilterHeadersStatus Filter::decodeHeaders(HeaderMap& headers, bool) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::decodeHeaders: Entering!");
  if (!config_->runtime().snapshot().featureEnabled("ratelimit.http_filter_enabled", 100)) {
    return FilterHeadersStatus::Continue;
  }

  initiateCall(headers);
  return (state_ == State::Calling || state_ == State::Responded)
             ? FilterHeadersStatus::StopIteration
             : FilterHeadersStatus::Continue;
}

FilterDataStatus Filter::decodeData(Buffer::Instance&, bool) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::decodeData: Entering!");
  ASSERT(state_ != State::Responded);
  if (state_ != State::Calling) {
    return FilterDataStatus::Continue;
  }
  // If the request is too large, stop reading new data until the buffer drains.
  return FilterDataStatus::StopIterationAndWatermark;
}

FilterTrailersStatus Filter::decodeTrailers(HeaderMap&) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::decodeTrailers: Entering!");
  ASSERT(state_ != State::Responded);
  return state_ == State::Calling ? FilterTrailersStatus::StopIteration
                                  : FilterTrailersStatus::Continue;
}

void Filter::setDecoderFilterCallbacks(StreamDecoderFilterCallbacks& callbacks) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::setDecoderFilterCallbacks: Entering!");
  callbacks_ = &callbacks;
}

void Filter::onDestroy() {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::onDestroy: Entering!");
  if (state_ == State::Calling) {
    state_ = State::Complete;
    client_->cancel();
  }
}

void Filter::complete(Envoy::RateLimit::LimitStatus status) {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: Entering!");
  state_ = State::Complete;

  switch (status) {
  case Envoy::RateLimit::LimitStatus::OK:
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: LimitStatus::OK");
    cluster_->statsScope().counter("ratelimit.ok").inc();
    break;
  case Envoy::RateLimit::LimitStatus::Error:
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: LimitStatus::ERROR");
    cluster_->statsScope().counter("ratelimit.error").inc();
    break;
  case Envoy::RateLimit::LimitStatus::OverLimit:
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: LimitStatus::OVERLIMIT");
    cluster_->statsScope().counter("ratelimit.over_limit").inc();
    Http::CodeUtility::ResponseStatInfo info{config_->scope(),
                                             cluster_->statsScope(),
                                             EMPTY_STRING,
                                             enumToInt(Code::TooManyRequests),
                                             true,
                                             EMPTY_STRING,
                                             EMPTY_STRING,
                                             EMPTY_STRING,
                                             EMPTY_STRING,
                                             false};
    Http::CodeUtility::chargeResponseStat(info);
    break;
  }

  if (status == Envoy::RateLimit::LimitStatus::OverLimit &&
      config_->runtime().snapshot().featureEnabled("ratelimit.http_filter_enforcing", 100)) {
    state_ = State::Responded;
    Http::HeaderMapPtr response_headers{new HeaderMapImpl(*getTooManyRequestsHeader())};
    callbacks_->encodeHeaders(std::move(response_headers), true);
    callbacks_->requestInfo().setResponseFlag(Http::AccessLog::ResponseFlag::RateLimited);
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: RateLimited");
  } else if (!initiating_call_) {
    callbacks_->continueDecoding();
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::complete: Appears to be OK");
  }
}

void Filter::populateRateLimitDescriptors(const Router::RateLimitPolicy& rate_limit_policy,
                                          std::vector<Envoy::RateLimit::Descriptor>& descriptors,
                                          const Router::RouteEntry* route_entry,
                                          const HeaderMap& headers) const {
  ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::populateRateLimitDescriptors: Entering!");
  for (const Router::RateLimitPolicyEntry& rate_limit :
       rate_limit_policy.getApplicableRateLimit(config_->stage())) {
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::populateRateLimitDescriptors: Loop hoop");
    const std::string& disable_key = rate_limit.disableKey();
    if (!disable_key.empty() &&
        !config_->runtime().snapshot().featureEnabled(
            fmt::format("ratelimit.{}.http_filter_enabled", disable_key), 100)) {
      ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::populateRateLimitDescriptors: Skipping");
      continue;
    }
    ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::populateRateLimitDescriptors: Calling populateDescriptors() internally");
    // ENVOY_LOG_MISC(debug, "RATELIMIT::Filter::populateRateLimitDescriptors: Calling populateDescriptors() internally: clusterName={}, headers={}, downstreamAddress={}",config_->localInfo().clusterName(),headers,callbacks_->downstreamAddress());
    rate_limit.populateDescriptors(*route_entry, descriptors, config_->localInfo().clusterName(),
                                   headers, callbacks_->downstreamAddress());
  }
}

} // namespace RateLimit
} // namespace Http
} // namespace Envoy
