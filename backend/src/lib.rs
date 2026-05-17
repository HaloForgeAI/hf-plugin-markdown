use hf_plugin_api::{
    HaloForgePlugin, IpcRegistrar, LogLevel, PluginContext, PluginError, PluginMetadata,
    PLUGIN_ABI_VERSION,
};

mod commands;

pub struct MarkdownPlugin;

impl MarkdownPlugin {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MarkdownPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl HaloForgePlugin for MarkdownPlugin {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            id: "dev.haloforge.markdown".into(),
            name: "Markdown Workspace".into(),
            version: "0.2.3".into(),
            description: "AI-native Markdown reader workspace inside HaloForge.".into(),
            author: "HaloForge Team".into(),
            abi_version: PLUGIN_ABI_VERSION,
        }
    }

    fn on_load(
        &mut self,
        ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError> {
        ctx.db().create_table(
            "recent_files",
            r#"
            id         TEXT PRIMARY KEY,
            path       TEXT NOT NULL UNIQUE,
            title      TEXT NOT NULL,
            opened_at  TEXT NOT NULL
            "#,
        )?;

        ipc.register("md_recent_files", Box::new(commands::md_recent_files))?;
        ipc.register("md_open_file", Box::new(commands::md_open_file))?;
        ipc.register("md_create_file", Box::new(commands::md_create_file))?;
        ipc.register("md_save_file", Box::new(commands::md_save_file))?;
        ipc.register("md_remove_recent_file", Box::new(commands::md_remove_recent_file))?;
        ipc.register("md_save_image", Box::new(commands::md_save_image))?;

        ctx.log(LogLevel::Info, "Markdown Workspace plugin loaded");
        Ok(())
    }

    fn on_unload(&mut self) -> Result<(), PluginError> {
        Ok(())
    }
}

hf_plugin_api::declare_plugin!(MarkdownPlugin, MarkdownPlugin::new);
