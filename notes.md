---
layout: notes
permalink: /notes/
title: Notes
nav: false
nav_order: 1
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 5
  sort_field: date
  sort_reverse: true
  trail:
    before: 1 # The number of links before the current page
    after: 3 # The number of links after the current page
---

<section class="notes-index" aria-labelledby="notes-heading">
  <h1 class="section-heading" id="notes-heading">Notes</h1>
  <div class="notes-intro">
    <p>{{ site.blog_description }}</p>
  </div>

  <div class="notes-list">
    {% if page.pagination.enabled %}
      {% assign postlist = paginator.posts %}
    {% else %}
      {% assign postlist = site.posts %}
    {% endif %}

    {% for post in postlist %}
      {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
      {% assign year = post.date | date: '%Y' %}
      <article class="note-entry">
        <div class="note-entry-heading">
          <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
          <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%b %d, %Y' }}</time>
        </div>
        {% if post.description %}
          <p class="note-description">{{ post.description }}</p>
        {% endif %}
        <p class="note-meta">
          {{ read_time }} min read
          {% if post.tags.size > 0 %}
            <span aria-hidden="true">·</span>
            {% for tag in post.tags %}
              <a class="quiet-link" href="{{ tag | slugify | prepend: '/notes/tag/' | relative_url }}">{{ tag }}</a>
              {%- unless forloop.last %}, {% endunless -%}
            {% endfor %}
          {% endif %}
        </p>
      </article>
    {% endfor %}

  </div>

{% if page.pagination.enabled %}
{% include pagination.liquid %}
{% endif %}
</section>
