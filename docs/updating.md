# Reviewed updates

For Orion, edit `homelab-infra/stacks/minecraft/release-lock.json` and Compose together. Verify the Minecraft, Java, Fabric, mod and Velocity compatibility matrix against upstream releases. Build and test the exact CraftDeck commit; record its immutable local image ID. No production setting should use `latest` without an image digest or an unversioned mod slug.

Before an update, make a complete stopped backup with the infrastructure `cold-backup.sh`, copy it off-host, and verify a restore in an isolated instance. Start the candidate on a disposable world and a copy of existing state first. Confirm authentication UUIDs, whitelist, registration, proxy IP forwarding and resource headroom.

After approval, stop through Komodo, materialize the reviewed files, preserve the previous project/lock and image, and update the world's `.deployment-lock.json` to the candidate release. Do not use the initial preparation script to overwrite an existing installation. Deploy manually and run the acceptance checks in the infrastructure README.

Rollback means restoring the matching complete data backup, panel database, secrets, proxy configuration and previous image/lock. Downgrading a version setting against a newer world is not a rollback. Managed panel restores deliberately refuse mismatched release locks.

For the standalone setup, `PROJECT_DIR` must equal the absolute host checkout. Update the explicit image, Minecraft, loader and Modrinth pins together. Config/mod Apply takes a required backup and aborts on failure. Newly added unversioned mod slugs remain a standalone convenience; pin their reviewed Modrinth version IDs before treating that installation as a locked release.
