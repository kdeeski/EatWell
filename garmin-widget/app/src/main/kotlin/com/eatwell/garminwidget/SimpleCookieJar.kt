package com.eatwell.garminwidget

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/** In-memory cookie jar that persists cookies across redirects within a session. */
class SimpleCookieJar : CookieJar {
    private val store = mutableMapOf<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val host = url.host
        val list = store.getOrPut(host) { mutableListOf() }
        for (cookie in cookies) {
            list.removeAll { it.name == cookie.name }
            list.add(cookie)
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val host = url.host
        return store.entries
            .filter { (domain, _) -> host.endsWith(domain) || domain.endsWith(host) }
            .flatMap { (_, cookies) -> cookies }
            .filter { it.matches(url) }
    }

    fun clear() = store.clear()
}
