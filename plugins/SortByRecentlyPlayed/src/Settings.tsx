import React from "react";

import { LunaSettings, LunaSwitchSetting, LunaNumberSetting } from "@luna/ui";
import { trace } from ".";
import { ReactiveStore } from "@luna/core";

const storageKey = "storeAllHistory";
const sortByRecentsKey = "sortByRecentlyPlayed";

export const settingsStore = await ReactiveStore.getPluginStorage("SortByRecentlyPlayed", { [storageKey]: false, [sortByRecentsKey]: false });

export const Settings = () => {
	const [storeAll, setStoreAll] = React.useState(settingsStore[storageKey]);
	const [sortByRecents, setSortByRecents] = React.useState(settingsStore[sortByRecentsKey]);

	return (
		<LunaSettings>
			<LunaSwitchSetting
				title="Sort by Recently Played"
				desc="Enable to sort your favorite albums by how recently you played them. This will persist across sessions."
				checked={sortByRecents}
				onChange={(_: React.ChangeEvent<HTMLInputElement>, checked?: boolean) => {
					setSortByRecents(settingsStore[sortByRecentsKey] = !!checked);
				}}
			/>
			<LunaSwitchSetting
				title="Store all recently played albums"
				desc="If enabled, the plugin will remember all albums you've ever played, not just the most recent 300."
				checked={storeAll}
				onChange={(_: React.ChangeEvent<HTMLInputElement>, checked?: boolean) => {
					setStoreAll(settingsStore[storageKey] = !!checked);
				}}
			/>
		</LunaSettings>
	);
};
