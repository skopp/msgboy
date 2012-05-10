# Msgboy

The msgboy is a *browser application* that pushes content from the web to its users. It observes the user's browsing habits (but respects their privacy!), and subscribes to the sites they seem to care about, using [Superfeedr](http://superfeedr.com). When these sites update, the content is sent to the user and a notification is shown to the user. 

The msgboy may not always show relevant messages, which is why *the user is asked to vote up or down on messages that he gets*. The msgboy learns from that and tries to only show relevant messages to the user.

The user can also see all the messages that he previously received using the dashboard. The size of the messages in the dashboard indicates their relevance.

You can get the msgboy from [http://msgboy.com](http://msgboy.com). However, we're still in an *early beta phase*, which means we try to limit the number of users to provide them with a personalized help should they have any issue. So, please, if you are using the msgboy, we kindly ask that you **report any issue**.

## Developers

The msgboy aims at using a lot of *open web protocols* and techniques to interact better with more online services and providing a universal notification service, without requiring them adapt to the msgboy. 

The msgboy is open source. We use git for source versioning and [github to host it](https://github.com/superfeedr/msgboy). Please, fork it, and feel free to change anything that doesn't suit your needs. Also, tell us about the changes so that we can maybe make the msgboy better for everyone using it!

### Technology used

Browsers API (Chrome, Firefox and Safari to come), [IndexedDB](http://www.w3.org/TR/IndexedDB/), [Websockets](http://dev.w3.org/html5/websockets/), [PubSubHubbub](http://code.google.com/p/pubsubhubbub/), [XMPP](http://xmpp.org/), [StropheJS](http://strophe.im/), [Backbone.js](http://documentcloud.github.com/backbone/), [jQuery](http://jquery.com/), [Node.js](http://nodejs.org/) and [Browserify](https://github.com/substack/node-browserify). If you're into 3 or more of these technologies, feel free to get in touch, *we're hiring*!

### Building the Msgboy

The msgboy is a javascript application. We use node.js for a lot of things, including tests, and when you modify the code, you need to rebuild the application using the following steps.

First make sure you have [ruby](http://www.ruby-lang.org/en/), as well as [node.js](http://nodejs.org/) installed:

    $ npm install // This will install all the dependencies
    $ rake build
    
### Debugging

Open Chrome and go to <code>[chrome://extensions/](chrome://extensions/)</code> in a new tab. Check the <code>Developer Mode</code> checkbox. Now, hit the <code>Load Unpacked extension</code> button and select the msgboy source directory.

If you expand the Msgboy section, you will then see the list of active views. Clicking on <code>/views/html/background.html</code> will let you inspect the background HTML page for the msgboy which runs continuously.

When you submit bug reports, please provide as much content as possible (Chrome version, as well as the logs from the background page).

### Plugins

When installing the msgboy, it will look at several existing services where the user may have already subscribed/followed/watched topics, users, or any kind of resource. The msgboy assumes that if a user has done that in the past, it means that he may care about this resource, so the msgboy will subscribe to that source. It is important that this source provide RSS/Atom feeds to allow for the subscription, obviously.

Similarly, when the user continues to use his favorite web services, he may subscribe/follow/watch additional resources. The msgboy then maps these new subscriptions and subscribes to the corresponding feeds.

All this is done with the help of the *plugins*. We have already implemented [several plugins](https://github.com/superfeedr/msgboy/tree/master/src/plugins) for some well known services. There is one for [Tumblr](https://github.com/superfeedr/msgboy/blob/master/src/plugins/tumblr.js), or [Google Reader](https://github.com/superfeedr/msgboy/blob/master/src/plugins/google-reader.js), but also for the [browser bookmarks](https://github.com/superfeedr/msgboy/blob/master/src/plugins/bookmarks.js), the [browser history](https://github.com/superfeedr/msgboy/blob/master/src/plugins/history.js)... etc.

We have also implemented a [generic](https://github.com/superfeedr/msgboy/blob/master/src/plugins/generic.js) bookmark that uses HTML5's data attributes to add a source to the msgboy when the user interacts with a page element. For example, if you have the msgboy installed and <a href="" class="msgboy-follow" data-msgboy-url="http://blog.msgboy.com/rss" >click on this link</a>, your msgboy will have a subscription for our blog.

The easiest way to integrate with the msgboy is to add the right HTML5 markup to your pages so that when one of your users does follows/subscribes/watches another resource, the msgboy can trigger a subscription on its own.

You may also create a full blown msgboy plugin, but we may not integrate it in the main release of the msgboy as we want to make sure we do not take too many resources from our user's computers.

## Publishers

Msgboy increases loyalty and engagement of your users and visitors. They can follow pages on your site so that when you add content, they're notified. 
Here are a few tips and tricks to make it easier for people to subscribe.

- Point to a feed that includes updates in each page of your site.
    * Put a single feed per page, corresponding to the content on that page.
    * Make sure you use a meaningful <code>title</code> in the <code>link</code> element. Do not include RSS, or Feed, but maybe just the title of the content. "Julien's Blog" is a good example. "RSS feed" is not, as it's not meaningful for users.
    
- Setup your feeds correctly.
    * Make sure your feed is correctly formatted, valid and easy to parse (limit to 10 entries, use unique identifiers for each entry, correctly formatted dates... etc)
    * Implement PubSubHubbub for realtime notifications (users are notified as soon as you update the content). [Superfeedr](http://superfeedr.com/publisher) hosts most of the hubs out there.
    
- Allowing for subscription. If your page has RSS feeds, we will obviously allow users to take them into account. But you can also do the following:
    * Create links like `<a target="_blank" href="web+subscribe:...">Subscribe</a>` which will allow people to subscribe to a feed, but they need to have designated Msgboy as their main Subscription application.
    * Use our Generic plugin (see above).

- Tricks
    * Listen to msgboy triggered events to keep track of your visitors who use msgboy, or who subscribe to your feeds. Listen to the events  <code>msgboy-subscribed</code> on the body.


## Misc

[![Flattr this git repo](http://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?user_id=julien51&url=https://github.com/superfeedr/msgboy&title=Msgboy&language=&tags=github&category=software)

