import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: DraftReview } =
  await import("../src/components/DraftReview.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const draft = {
  id: "d",
  title: "Website portfolio",
  summary: "Contact Alex and choose one project.",
  source: "All original words stay here.",
  updates: [],
  organizer: "apple-local",
  state: "draft",
  steps: [
    {
      id: "a",
      title: "Ask Alex about a project",
      label: "Contact Alex",
      smallAction: "Open Alex’s contact",
    },
    { id: "b", title: "Choose one example", label: "Portfolio" },
  ],
};
test("draft offers choices without typing, advances after deferral, and preserves original words", async () => {
  let view, selected, deferred;
  const props = {
    draft,
    busy: false,
    organizing: false,
    error: "",
    notice: "",
    onChoose: (s, small) => (selected = [s.id, small]),
    onDefer: (s) => (deferred = s.id),
    onPark() {},
    onOrganize() {},
    onClose() {},
  };
  await act(async () => {
    view = renderer.create(React.createElement(DraftReview, props));
  });
  const button = (label) =>
    view.root
      .findAllByType("Pressable")
      .find((x) => x.props.accessibilityLabel === label);
  assert.equal(view.root.findAllByType("TextInput").length, 0);
  assert.ok(!JSON.stringify(view.toJSON()).includes(draft.source));
  await act(async () => button("Start smaller").props.onPress());
  assert.deepEqual(selected, ["a", true]);
  await act(async () => button("Not now").props.onPress());
  assert.equal(deferred, "a");
  await act(async () =>
    view.update(
      React.createElement(DraftReview, {
        ...props,
        draft: {
          ...draft,
          steps: [{ ...draft.steps[0], deferred: true }, draft.steps[1]],
        },
      }),
    ),
  );
  await act(async () => button("Choose this step").props.onPress());
  assert.deepEqual(selected, ["b", false]);
  await act(async () => button("Show original words").props.onPress());
  assert.ok(JSON.stringify(view.toJSON()).includes(draft.source));
  await act(async () => view.unmount());
});
test("reflective note has no forced action; busy choices cannot be pressed by the UI", async () => {
  let view;
  const props = {
    draft: { ...draft, steps: [] },
    busy: false,
    organizing: false,
    error: "",
    notice: "",
    onChoose() {},
    onDefer() {},
    onPark() {},
    onOrganize() {},
    onClose() {},
  };
  await act(async () => {
    view = renderer.create(React.createElement(DraftReview, props));
  });
  assert.ok(
    JSON.stringify(view.toJSON()).includes("This can simply be a thought."),
  );
  await act(async () =>
    view.update(
      React.createElement(DraftReview, { ...props, draft, busy: true }),
    ),
  );
  assert.ok(
    view.root
      .findAllByType("Pressable")
      .find((x) => x.props.accessibilityLabel === "Choose this step").props
      .disabled,
  );
  await act(async () => view.unmount());
});
