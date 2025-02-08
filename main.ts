import { Plugin } from "obsidian";
import HeatmapCalendarSettingsTab from "settings";

interface CalendarData {
	year: number;
	colors:
		| {
				[index: string | number]: string[];
		  }
		| string;
	entries: Entry[];
	showCurrentDayBorder: boolean;
	defaultEntryIntensity: number;
	intensityScaleStart: number;
	intensityScaleEnd: number;
	weeks: number;
	hideYear: boolean;
}

interface CalendarSettings extends CalendarData {
	colors: {
		[index: string | number]: string[];
	};
	weekStartDay: number;
}

interface Entry {
	date: string;
	intensity?: number;
	color: string;
	content: string;
}
const DEFAULT_SETTINGS: CalendarSettings = {
	year: new Date().getFullYear(),
	colors: {
		default: ["#c6e48b", "#7bc96f", "#49af5d", "#2e8840", "#196127"],
	},
	entries: [
		{ date: "1900-01-01", color: "#7bc96f", intensity: 5, content: "" },
	],
	showCurrentDayBorder: true,
	defaultEntryIntensity: 4,
	intensityScaleStart: 1,
	intensityScaleEnd: 5,
	weekStartDay: 0,
	weeks: 12,
	hideYear: true
};
export default class HeatmapCalendar extends Plugin {
	settings: CalendarSettings;

	/**
	 * Returns a number representing how many days into the year the supplied date is.
	 * Example: first of january is 1, third of february is 34 (31+3)
	 * @param date
	 */

	getHowManyDaysIntoYear(date: Date): number {
		return (
			(Date.UTC(
				date.getUTCFullYear(),
				date.getUTCMonth(),
				date.getUTCDate()
			) -
				Date.UTC(date.getUTCFullYear(), 0, 0)) /
			24 /
			60 /
			60 /
			1000
		);
	}
	getHowManyDaysIntoYearLocal(date: Date): number {
		return (
			(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
				Date.UTC(date.getFullYear(), 0, 0)) /
			24 /
			60 /
			60 /
			1000
		);
	}

	getStartDate(date: Date, weeks: number): Date {
		return new Date(
			Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
				weeks * 7 * 24 * 60 * 60 * 1000
		);
	}
	/**
	 * Removes HTMLElements passed as entry.content and outside of the displayed year from rendering above the calendar
	 */
	removeHtmlElementsNotInYear(entries: Entry[], year: number) {
		const calEntriesNotInDisplayedYear =
			entries.filter((e) => new Date(e.date).getFullYear() !== year) ??
			this.settings.entries;
		//@ts-ignore
		calEntriesNotInDisplayedYear.forEach(
			(e) => e.content instanceof HTMLElement && e.content.remove()
		);
	}

	removeHtmlElementsNotInWeeks(entries: Entry[], startDate: Date) {
		const toRemove = entries.filter((e) => new Date(e.date) < startDate);
		//@ts-ignore
		toRemove.forEach(
			(e) => e.content instanceof HTMLElement && e.content.remove()
		);
	}

	clamp(input: number, min: number, max: number): number {
		return input < min ? min : input > max ? max : input;
	}

	map(
		current: number,
		inMin: number,
		inMax: number,
		outMin: number,
		outMax: number
	): number {
		const mapped: number =
			((current - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
		return this.clamp(mapped, outMin, outMax);
	}

	getWeekdayShort(dayNumber: number): string {
		return new Date(
			1970,
			0,
			dayNumber + this.settings.weekStartDay + 4
		).toLocaleDateString("en-US", { weekday: "short" });
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new HeatmapCalendarSettingsTab(this.app, this));

		//@ts-ignore
		window.renderHeatmapCalendar = (
			el: HTMLElement,
			calendarData: CalendarData
		): void => {
			// for week conversion
			// get startDate
			const startDate = this.getStartDate(new Date(), calendarData.weeks);
			console.log("start date");
			console.log(startDate);
			// get previous day on or before starDate that is weekStartDay
			const numberOfDaysBeforeStartDateWeekStarts =
				(startDate.getUTCDay() + 7 - this.settings.weekStartDay) % 7;
			const startDateWeekStart = new Date(
				startDate.getTime() -
					numberOfDaysBeforeStartDateWeekStarts * 24 * 60 * 60 * 1000
			);

			const year = calendarData.year ?? this.settings.year;
			const colors =
				typeof calendarData.colors === "string"
					? this.settings.colors[calendarData.colors]
						? {
								[calendarData.colors]:
									this.settings.colors[calendarData.colors],
						  }
						: this.settings.colors
					: calendarData.colors ?? this.settings.colors;

			this.removeHtmlElementsNotInWeeks(
				calendarData.entries,
				startDateWeekStart
			);

			const calEntries = calendarData.entries.filter(
				(e) => new Date(e.date + "T00:00") > startDateWeekStart
			);
			const showCurrentDayBorder =
				calendarData.showCurrentDayBorder ??
				this.settings.showCurrentDayBorder;

			const defaultEntryIntensity =
				calendarData.defaultEntryIntensity ??
				this.settings.defaultEntryIntensity;

			const intensities = calEntries
				.filter((e) => e.intensity)
				.map((e) => e.intensity as number);
			const minimumIntensity = intensities.length
				? Math.min(...intensities)
				: this.settings.intensityScaleStart;
			const maximumIntensity = intensities.length
				? Math.max(...intensities)
				: this.settings.intensityScaleEnd;
			const intensityScaleStart =
				calendarData.intensityScaleStart ?? minimumIntensity;
			const intensityScaleEnd =
				calendarData.intensityScaleEnd ?? maximumIntensity;

			const mappedEntries: Entry[] = [];
			let entryIteration = 0;
			calEntries.forEach((e) => {
				const newEntry = {
					intensity: defaultEntryIntensity,
					...e,
				};
				const colorIntensities =
					typeof colors === "string"
						? this.settings.colors[colors]
						: colors[e.color] ?? colors[Object.keys(colors)[0]];

				const numOfColorIntensities =
					Object.keys(colorIntensities).length;

				if (
					minimumIntensity === maximumIntensity &&
					intensityScaleStart === intensityScaleEnd
				)
					newEntry.intensity = numOfColorIntensities;
				else
					newEntry.intensity = Math.round(
						this.map(
							newEntry.intensity,
							intensityScaleStart,
							intensityScaleEnd,
							1,
							numOfColorIntensities
						)
					);

				mappedEntries[entryIteration] = newEntry;
				entryIteration++;
			});
			console.log(Array.from(calEntries.values()));

			const firstDayOfYear = new Date(Date.UTC(year, 0, 1));

			interface Box {
				backgroundColor?: string;
				date?: string;
				content?: string;
				classNames?: string[];
			}

			const boxes: Array<Box> = [];

			const lastDayOfYear = new Date(Date.UTC(year, 11, 31));
			const numberOfDaysInYear =
				this.getHowManyDaysIntoYear(lastDayOfYear); //eg 365 or 366
			const todaysDayNumberLocal = this.getHowManyDaysIntoYearLocal(
				new Date()
			);

			const boxCount = calendarData.weeks * 7 + numberOfDaysBeforeStartDateWeekStarts + 1
			console.log("boxCount");
			console.log(
				boxCount
			);
			let months: string[] = [];
			let weekLabels: string[] = [];
			let currentWeek = 0;
			for (
				let day = 0;
				day <
				boxCount;
				day++
			) {
				const box: Box = {
					classNames: [],
				};

				// determine the date and month for the current box
				const currentDate = new Date(
					startDateWeekStart.getTime() + day * 24 * 60 * 60 * 1000
				);
				const month = currentDate.toLocaleString("en-us", {
					month: "short",
				});

				// Add the month class name to the box
				box.classNames?.push(`month-${month.toLowerCase()}`); // e.g., "month-jan", "month-feb", etc.
				if (!months.contains(month)) {
					months.push(month);
				}
				if (day % 7 == 0) {
					// label every other week
					if (currentWeek % 2 == 0) {
						const monthLabel = String(
							currentDate.getMonth() + 1
						).padStart(2, "0");
						const dateLabel = String(
							currentDate.getDate() + 1
						).padStart(2, "0");
						weekLabels.push(`${monthLabel}-${dateLabel}`);
					} else {
						weekLabels.push("");
					}
					currentWeek++;
				}
				// if (day === todaysDayNumberLocal && showCurrentDayBorder)
				// 	box.classNames?.push("today");

				if (mappedEntries[day]) {
					box.classNames?.push("hasData");
					const entry = mappedEntries[day];
					console.log(entry);
					box.date = entry.date;

					if (entry.content) box.content = entry.content;

					const currentDayColors = entry.color
						? colors[entry.color]
						: colors[Object.keys(colors)[0]];
					box.backgroundColor =
						currentDayColors[(entry.intensity as number) - 1];
				} else {
					console.log("unmapped")
					console.log(day)
					box.classNames?.push("isEmpty")
				};
				boxes.push(box);
			}

			const heatmapCalendarGraphDiv = createDiv({
				cls: "heatmap-calendar-graph",
				parent: el,
			});
			let yearVisibility = "visible";
			if (calendarData.hideYear ?? this.settings.hideYear) {
				yearVisibility = "hidden"
			}

			console.log(yearVisibility) 
			createDiv({
				attr: {
					style: `visibility: ${yearVisibility}`,
				},
				cls: "heatmap-calendar-year",
				text: String(year).slice(2),
				parent: heatmapCalendarGraphDiv,
			});

			// const heatmapCalendarMonthsUl = createEl("ul", {
			// 	attr: {
			// 		"style": `grid-template-columns: repeat(${calendarData.weeks/4 + 1}, minmax(0, 1fr));`
			// 	},
			// 	cls: "heatmap-calendar-months",
			// 	parent: heatmapCalendarGraphDiv,
			// })
			// console.log(months)
			// months.forEach((month) => {
			// 	console.log(month)
			// 	createEl("li", { text: month, parent: heatmapCalendarMonthsUl, })

			// })

			const heatmapCalendarWeeksUl = createEl("ul", {
				attr: {
					style: `grid-template-columns: repeat(${
						calendarData.weeks + 1
					}, minmax(0, 1fr)); color: #fff	`,
				},
				cls: "heatmap-calendar-months",
				parent: heatmapCalendarGraphDiv,
			});
			weekLabels.forEach((week) => {
				createEl("li", {
					attr: {
						style: `
							grid-template-columns: repeat(${calendarData.weeks + 1}, minmax(0, 1fr)); 
							display: inline-block;
							text-align: center;
							margin: 0;
						`,
					},
					text: week.toString(),
					parent: heatmapCalendarWeeksUl,
				});
			});

			const heatmapCalendarDaysUl = createEl("ul", {
				cls: "heatmap-calendar-days",
				parent: heatmapCalendarGraphDiv,
			});

			for (let i = 0; i < 7; i++) {
				createEl("li", {
					text: this.getWeekdayShort(i),
					parent: heatmapCalendarDaysUl,
				});
			}

			const heatmapCalendarBoxesUl = createEl("ul", {
				attr: {
					style: `grid-template-columns: repeat(${
						calendarData.weeks + 1
					}, minmax(0, 1fr))`,
				},
				cls: "heatmap-calendar-boxes",
				parent: heatmapCalendarGraphDiv,
			});

			boxes.forEach((e) => {
				const entry = createEl("li", {
					attr: {
						...(e.backgroundColor && {
							style: `background-color: ${e.backgroundColor};`,
						}),
						...(e.date && { "data-date": e.date }),
					},
					cls: e.classNames,
					parent: heatmapCalendarBoxesUl,
				});

				createSpan({
					cls: "heatmap-calendar-content",
					parent: entry,
					text: e.content,
				});
			});
		};
	}

	onunload() {}

	async loadSettings() {
		console.log("heyoh", await this.loadData());
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
