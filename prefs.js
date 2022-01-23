//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//                       Copyright (c) 2021 Simon Schneegans                            //
//          Released under the GPLv3 or later. See LICENSE file for details.            //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const {Gio, Gtk, Gdk, GLib, GObject} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me             = imports.misc.extensionUtils.getCurrentExtension();
const utils          = Me.imports.src.utils;

// New effects must be registered here and in extension.js.
const ALL_EFFECTS = [
  Me.imports.src.EnergizeA.EnergizeA,
  Me.imports.src.EnergizeB.EnergizeB,
  Me.imports.src.Fire.Fire,
  Me.imports.src.Matrix.Matrix,
  Me.imports.src.BrokenGlass.BrokenGlass,
  Me.imports.src.TRexAttack.TRexAttack,
  Me.imports.src.TVEffect.TVEffect,
  Me.imports.src.Wisps.Wisps,
];

// This template widget class is defined at the bottom of this file.
var BurnMyWindowsEffectPage = null;

//////////////////////////////////////////////////////////////////////////////////////////
// The preferences dialog is organized in pages, each of which is loaded from a         //
// separate ui file. There's one page with general options, all other paged are loaded  //
// from the respective effects.                                                         //
//////////////////////////////////////////////////////////////////////////////////////////

var PreferencesDialog = class PreferencesDialog {

  // ------------------------------------------------------------ constructor / destructor

  constructor() {
    // Load all of our resources.
    this._resources = Gio.Resource.load(Me.path + '/resources/burn-my-windows.gresource');
    Gio.resources_register(this._resources);

    // Load the CSS file for the settings dialog.
    const styleProvider = Gtk.CssProvider.new();
    styleProvider.load_from_resource('/css/gtk.css');
    if (utils.isGTK4()) {
      Gtk.StyleContext.add_provider_for_display(
          Gdk.Display.get_default(), styleProvider,
          Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    } else {
      Gtk.StyleContext.add_provider_for_screen(
          Gdk.Screen.get_default(), styleProvider,
          Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    // Make sure custom icons are found.
    if (utils.isGTK4()) {
      Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).add_resource_path('/img');
    } else {
      Gtk.IconTheme.get_default().add_resource_path('/img');
    }

    // Register the template widgets used in the settings dialog.
    this._registerCustomClasses();

    // Store a reference to the settings object.
    this._settings = ExtensionUtils.getSettings();

    // Load the general user interface files.
    this._builder = new Gtk.Builder();
    this._builder.add_from_resource(`/ui/common/main-menu.ui`);
    this._builder.add_from_resource(`/ui/${utils.getGTKString()}/prefs.ui`);

    // Bind general options properties.
    this.bindSwitch('destroy-dialogs');

    // Add all other effect pages.
    const stack = this._builder.get_object('main-stack');
    ALL_EFFECTS.forEach(Effect => {
      const [minMajor, minMinor] = Effect.getMinShellVersion();
      if (utils.shellVersionIsAtLeast(minMajor, minMinor)) {

        const page = new BurnMyWindowsEffectPage(Effect, this);

        // Add the Effect's preferences (if any).
        const preferences = Effect.getPreferences(this);
        if (preferences) {
          this.gtkBoxAppend(page, preferences);
        }

        stack.add_titled(page, Effect.getNick(), Effect.getLabel());
      }
    });

    // This is our top-level widget which we will return later.
    this._widget = this._builder.get_object('settings-widget');

    // Some things can only be done once the widget is shown as we do not have access to
    // the toplevel widget before.
    this._widget.connect('realize', (widget) => {
      const window = utils.isGTK4() ? widget.get_root() : widget.get_toplevel();

      // Show the version number in the title bar.
      window.set_title(`Burn-My-Windows ${Me.metadata.version}`);

      // Add the main menu to the title bar.
      {
        // Add the menu button to the title bar.
        const menu = this._builder.get_object('menu-button');
        window.get_titlebar().pack_end(menu);

        // Populate the menu with actions.
        const group = Gio.SimpleActionGroup.new();
        window.insert_action_group('prefs', group);

        const addAction = (name, uri) => {
          const action = Gio.SimpleAction.new(name, null);
          action.connect('activate', () => Gtk.show_uri(null, uri, Gdk.CURRENT_TIME));
          group.add_action(action);
        };

        // clang-format off
        addAction('homepage',      'https://github.com/Schneegans/Burn-My-Windows');
        addAction('changelog',     'https://github.com/Schneegans/Burn-My-Windows/blob/main/docs/changelog.md');
        addAction('bugs',          'https://github.com/Schneegans/Burn-My-Windows/issues');
        addAction('new-effect',    'https://github.com/Schneegans/Burn-My-Windows/blob/main/docs/how-to-create-new-effects.md');
        addAction('donate-paypal', 'https://www.paypal.com/donate/?hosted_button_id=3F7UFL8KLVPXE');
        addAction('donate-github', 'https://github.com/sponsors/Schneegans');
        // clang-format on
      }

      // Populate the close-effects drop-down menu.
      {
        const menu  = this._builder.get_object('close-effect-menu');
        const group = Gio.SimpleActionGroup.new();
        window.insert_action_group('close-effects', group);

        ALL_EFFECTS.forEach(Effect => {
          const [minMajor, minMinor] = Effect.getMinShellVersion();
          if (utils.shellVersionIsAtLeast(minMajor, minMinor)) {
            const nick       = Effect.getNick();
            const label      = Effect.getLabel();
            const actionName = nick + '-close-effect';
            const fullName   = 'close-effects.' + actionName;

            const action = this._settings.create_action(actionName);
            group.add_action(action);

            menu.append_item(Gio.MenuItem.new(label, fullName));
          }
        });
      }
    });

    // As we do not have something like a destructor, we just listen for the destroy
    // signal of our main widget.
    this._widget.connect('destroy', () => {
      // Unregister our resources.
      Gio.resources_unregister(this._resources);
    });

    // Show the widgets on GTK3.
    if (!utils.isGTK4()) {
      this._widget.show_all();
    }
  }

  // -------------------------------------------------------------------- public interface

  // Returns the internally used Gtk.Builder. Effects can use this to modify the UI of the
  // preferences dialog.
  getBuilder() {
    return this._builder;
  }

  // Returns a Gio.Settings object for this extension.
  getSettings() {
    return this._settings;
  }

  // Returns the widget used for the settings of this extension.
  getWidget() {
    return this._widget;
  }

  // Connects a Gtk.ComboBox (or anything else which has an 'active-id' property) to a
  // settings key. It also binds the corresponding reset button.
  bindCombobox(settingsKey) {
    this._bind(settingsKey, 'active-id');
  }

  // Connects a Gtk.Adjustment (or anything else which has a 'value' property) to a
  // settings key. It also binds the corresponding reset button.
  bindAdjustment(settingsKey) {
    this._bind(settingsKey, 'value');
  }

  // Connects a Gtk.Switch (or anything else which has an 'active' property) to a settings
  // key. It also binds the corresponding reset button.
  bindSwitch(settingsKey) {
    this._bind(settingsKey, 'active');
  }

  // Colors are stored as strings like 'rgb(1, 0.5, 0)'. As Gio.Settings.bind_with_mapping
  // is not available yet, we need to do the color conversion manually. It also binds the
  // corresponding reset button.
  bindColorButton(settingsKey) {

    const button = this._builder.get_object(settingsKey);

    if (button) {

      // Update the settings when the color is modified.
      button.connect('color-set', () => {
        this._settings.set_string(settingsKey, button.get_rgba().to_string());
      });

      // Update the button state when the settings change.
      const settingSignalHandler = () => {
        const rgba = new Gdk.RGBA();
        rgba.parse(this._settings.get_string(settingsKey));
        button.rgba = rgba;
      };

      this._settings.connect('changed::' + settingsKey, settingSignalHandler);

      // Initialize the button with the state in the settings.
      settingSignalHandler();
    }

    this._bindResetButton(settingsKey);
  }

  // ----------------------------------------------------------------- GTK3 / GTK4 helpers

  // Appends the given child widget to the given Gtk.Box.
  gtkBoxAppend(box, child) {
    if (utils.isGTK4()) {
      box.append(child);
    } else {
      box.pack_start(child, false, false, 0);
    }
  }

  // ----------------------------------------------------------------------- private stuff

  // Searches for a reset button for the given settings key and make it reset the settings
  // key when clicked.
  _bindResetButton(settingsKey) {
    const resetButton = this._builder.get_object('reset-' + settingsKey);
    if (resetButton) {
      resetButton.connect('clicked', () => {
        this._settings.reset(settingsKey);
      });
    }
  }

  // Connects any widget's property to a settings key. The widget must have the same ID as
  // the settings key. It also binds the corresponding reset button.
  _bind(settingsKey, property) {
    const object = this._builder.get_object(settingsKey);

    if (object) {
      this._settings.bind(settingsKey, object, property, Gio.SettingsBindFlags.DEFAULT);
    }

    this._bindResetButton(settingsKey);
  }

  // Initializes template widgets used by the preferences dialog.
  _registerCustomClasses() {

    // Each effect page is based on a template widget. This template contains the title
    // and the preview button.
    // clang-format off
    BurnMyWindowsEffectPage =
      GObject.registerClass({
        GTypeName: 'BurnMyWindowsEffectPage',
        Template: `resource:///ui/${utils.getGTKString()}/effectPage.ui`,
        InternalChildren: ['label', 'button'],
      },
      class BurnMyWindowsEffectPage extends Gtk.Box {
        _init(Effect, dialog) {
          super._init();

          // Set the effect's name as label.
          this._label.label = Effect.getLabel();

          // Open the preview window once the preview button is clicked.
          this._button.connect('clicked', () => {

            // Set the to-be-previewed effect.
            dialog.getSettings().set_string('close-preview-effect', Effect.getNick());

            // Create the preview-window.
            const window = new Gtk.Window({
              title: `Preview for ${Effect.getLabel()}`,
              default_width: 800,
              default_height: 450,
              modal: true,
              transient_for: utils.isGTK4() ? this._button.get_root() :
                                              this._button.get_toplevel()
            });

            const box = new Gtk.Box({
              orientation: Gtk.Orientation.VERTICAL,
              valign: Gtk.Align.CENTER,
              spacing: 10,
            });

            const label = Gtk.Label.new('Close this Window to Preview the Effect!');
            label.get_style_context().add_class('large-title');

            const image = new Gtk.Image({
              icon_name: 'burn-my-windows-symbolic',
              pixel_size: 128,
            });

            dialog.gtkBoxAppend(box, image);
            dialog.gtkBoxAppend(box, label);

            if (utils.isGTK4()) {
              window.set_child(box);
            } else {
              window.add(box);
            }

            window.show();
          });
        }
      });
    // clang-format on
  }
}

// Nothing to do for now...
function init() {}

// This function is called when the preferences window is created to build and return a
// Gtk widget. We create a new instance of the PreferencesDialog class each time this
// method is called. This way we can actually open multiple settings windows and interact
// with all of them properly.
function buildPrefsWidget() {
  var dialog = new PreferencesDialog();
  return dialog.getWidget();
}
