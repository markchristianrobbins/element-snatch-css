# Element Snatch CSS
An [Obsidian](https://obsidian.md) plugin to copy CSS selectors for any element on the page. Two modes basically.

- `Ctrl + Shift + Middle-click` to show a **Path Menu**.
- `Ctrl + Middle-click` to show a **CSS Menu**.

Both menus look identical, but have different ultimate behaviors.
The menus offer a list of all elements from the deepest clicked target up to the body.
Hovering a menu item highlights its element and provides a preview tooltip.

In **Path Mode**, clicking a menu item will copy two lines to the clipboard representing the path upwards from the selected menu item:
- Decendents - there **are no** decendent arrows in the path.
- Children - there **are** decendent arrows in the path.

In **CSS Mode**, clicking a menu item will copy a block of **nested CSS** representing that element and all its descendants. Put the results in an editor with good code folding to see the structure and have a source of selectors. There is a limiter so it is not recommended to select high level elements with many descendants.

## About
This is a proof of concept and an experiment using AI to do coding.

## To Do

- Add Settings - the modifiers are hard coded.
- Publish on Obsidian
