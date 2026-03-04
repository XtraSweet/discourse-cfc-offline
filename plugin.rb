# frozen_string_literal: true

# name: discourse-cfc-offline
# about: Adds offline PWA caching to the service worker – caches HTML shell and assets so the CFC app works after an offline refresh.
# version: 0.1
# url: https://comfortfoodie.club

register_service_worker "service-worker-cfc.js"
