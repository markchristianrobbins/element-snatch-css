# Element Snatch CSS

An [Obsidian](https://obsidian.md) plugin to copy CSS selectors for any element on the page. Two modes basically.

-   `Ctrl + Shift + Middle-click` to show a **Path Menu**.
-   `Ctrl + Middle-click` to show a **CSS Menu**.

Both menus look identical, but have different ultimate behaviors.
The menus offer a list of all elements from the deepest clicked target up to the body.
Hovering a menu item highlights its element and provides a preview tooltip.

In **Path Mode**, clicking a menu item will copy two lines to the clipboard representing the path upwards from the selected menu item:

-   Decendents - there **are no** decendent arrows in the path.
-   Children - there **are** decendent arrows in the path.

In **CSS Mode**, clicking a menu item will copy a block of **nested CSS** representing that element and all its descendants. Put the results in an editor with good code folding to see the structure and have a source of selectors. There is a limiter so it is not recommended to select high level elements with many descendants.

## Outputs to clipboard

### Path Output Example

``` css
/** menu pick */     /** deepest from click */
.vertical-tab-header .vertical-tab-header-group
.vertical-tab-header > .vertical-tab-header-group

```

### CSS Output Example

``` css
.vertical-tab-header-group-items {
    content: ".vertical-tab-header-group-items";
    content: ".vertical-tab-header-group-items";
    content: "";
    /** When there are class-wise identical siblings, the entries are compressed. */
    /** Identical siblings means same class and same children, ignoring text content. */
    /** The entry below represents 6 siblings. Note how the content values come from the siblings. */
    .vertical-tab-nav-item { /** 6 times */
        content: ".vertical-tab-header-group-items .vertical-tab-nav-item";
        content: ".vertical-tab-header-group-items > .vertical-tab-nav-item";
        content: "General";         /** 1) this text content */
        content: "Editor";          /** 2) next text content */
        content: "Files and links"; /** 3) text content */
        content: "Appearance";      /** 4) text content */
        content: "Hotkeys";         /** 5) text content */
        content: "Core plugins";    /** 6) text content */
        .vertical-tab-nav-item-chevron {
            content: ".vertical-tab-header-group-items .vertical-tab-nav-item .vertical-tab-nav-item-chevron";
            content: ".vertical-tab-header-group-items > .vertical-tab-nav-item > .vertical-tab-nav-item-chevron";
            content: "";
            .svg-icon.lucide-chevron-right {
                content: ".vertical-tab-header-group-items .vertical-tab-nav-item .vertical-tab-nav-item-chevron .svg-icon.lucide-chevron-right";
                content: ".vertical-tab-header-group-items > .vertical-tab-nav-item > .vertical-tab-nav-item-chevron > .svg-icon.lucide-chevron-right";
                content: "";
                path {
                    content: ".vertical-tab-header-group-items .vertical-tab-nav-item .vertical-tab-nav-item-chevron .svg-icon.lucide-chevron-right path";
                    content: ".vertical-tab-header-group-items > .vertical-tab-nav-item > .vertical-tab-nav-item-chevron > .svg-icon.lucide-chevron-right > path";
                    content: "";
                }
            }
        }
    }
    .vertical-tab-nav-item.is-active {
        content: ".vertical-tab-header-group-items .vertical-tab-nav-item.is-active";
        content: ".vertical-tab-header-group-items > .vertical-tab-nav-item.is-active";
        content: "Community plugins";
        .vertical-tab-nav-item-chevron {
            content: ".vertical-tab-header-group-items .vertical-tab-nav-item.is-active .vertical-tab-nav-item-chevron";
            content: ".vertical-tab-header-group-items > .vertical-tab-nav-item.is-active > .vertical-tab-nav-item-chevron";
            content: "";
            .svg-icon.lucide-chevron-right {
                content: ".vertical-tab-header-group-items .vertical-tab-nav-item.is-active .vertical-tab-nav-item-chevron .svg-icon.lucide-chevron-right";
                content: ".vertical-tab-header-group-items > .vertical-tab-nav-item.is-active > .vertical-tab-nav-item-chevron > .svg-icon.lucide-chevron-right";
                content: "";
                path {
                    content: ".vertical-tab-header-group-items .vertical-tab-nav-item.is-active .vertical-tab-nav-item-chevron .svg-icon.lucide-chevron-right path";
                    content: ".vertical-tab-header-group-items > .vertical-tab-nav-item.is-active > .vertical-tab-nav-item-chevron > .svg-icon.lucide-chevron-right > path";
                    content: "";
                }
            }
        }
    }
}

```

## About

This is a proof of concept and an experiment using AI to do coding.

## To Do

-   Add Settings - the modifiers are hard coded.
-   Publish on Obsidian
