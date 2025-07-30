import React from "react";
import { LunaSettings, LunaSwitchSetting, LunaNumberSetting } from "@luna/ui";
import { ReactiveStore } from "@luna/core";

// Settings keys
const trackThresholdKey = "trackThreshold";
const maxHistoryKey = "maxHistory";
const trackWithoutSortKey = "trackWithoutSort";

export const settingsStore = await ReactiveStore.getPluginStorage(
  "SortByRecentlyPlayed",
  {
    [trackThresholdKey]: 4,
    [maxHistoryKey]: 300,
    [trackWithoutSortKey]: false,
  },
);

export const Settings = () => {
  const [trackThreshold, setTrackThreshold] = React.useState(
    settingsStore[trackThresholdKey],
  );
  const [maxHistory, setMaxHistory] = React.useState(
    settingsStore[maxHistoryKey],
  );
  const [trackWithoutSort, setTrackWithoutSort] = React.useState(
    settingsStore[trackWithoutSortKey],
  );

  return (
    <LunaSettings>
      <LunaNumberSetting
        title="Tracks to Consider Album 'Listened'"
        desc="Number of consecutive tracks from the same album that need to be played before the album is considered 'listened' and moved to the top of your recently played list."
        value={trackThreshold}
        // onNumber={(num) => setChangeBy((storage.changeBy = num))}
        onNumber={(value: number) => {
          setTrackThreshold((settingsStore[trackThresholdKey] = value));
        }}
        min={1}
        max={20}
      />
      <LunaNumberSetting
        title="Maximum Albums to Remember"
        desc="Maximum number of albums to keep in your recently played history."
        value={maxHistory}
        onNumber={(value: number) => {
          setMaxHistory((settingsStore[maxHistoryKey] = value));
        }}
        min={50}
        max={1000}
      />
      <LunaSwitchSetting
        title="Keep tracking order but don't sort"
        desc="Track recently played albums but don't automatically sort the albums page. If disabled, albums will be sorted by recently played order."
        onChange={(
          _: React.ChangeEvent<HTMLInputElement>,
          checked?: boolean,
        ) => {
          setTrackWithoutSort((settingsStore[trackWithoutSortKey] = !!checked));
        }}
      />
    </LunaSettings>
  );
};
