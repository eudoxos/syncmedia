# syncmedia

## (Sphinx extension for audio transcripts)

This extension defines two user-facing elements:

* `syncmedia` directive, which declares audio source (URL) for subsequent `sync` points. It takes a few options:

   - `show`: whether the source itself should be shown in the document; this is a large loudspeaker in HTML, and QR code in LaTeX (with URL on the side). Off by default.
   - `offset`: time (in seconds or hh:mm:ss) which will be added to `sync` marks when starting playback. Zero by default.
   - `duration`: free-form informatinve string which will be added as an extra text to the LaTeX QR code.

* `sync` role, taking a timestamp as parameter (e.g. `1:03:43` or `3:45`). The parameters must be non-decreasing. The sync role renders in the output as follows:

   - in HTML, it is a smaller hyperlink; when clicked, audio player will start at the position; there is some JavaScript which will (attempt to) highlight the currently played position, between adjacent `sync` marks.

     - The timestamps can be hidden by cklicking the chronometer icon in the page heading (when using the sphinxbook theme); this is useful to copy the text for further processing.

   - in LaTeX, clickable margin-note will be added to the output, so that it can be clicked when the PDF is viewed electronically.

## Notes

* The extension injects the [text fragments polyfill](https://github.com/GoogleChromeLabs/text-fragments-polyfill), so hyperlink created with e.g. “Copy link to selected text” will correctly open even with browsers which don't support those links natively (especially [Firefox](https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments)).
* The audio player in HTML will position itself in the header of the page. This will very likely work only with the `sphinxbook` theme.
* When sync points are hidden, the highlight of the current section will not work.
* There is no guarantee about anything whatsoever.
