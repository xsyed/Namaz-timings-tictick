import "dotenv/config";
import { DateTime } from "luxon";

const ZONE = "America/Edmonton";

async function getSchedule(url: string, date: string) {
  const response = await fetch(url);
  const js = await response.text();

  const line = js
    .split("\n")
    .find((line) => line.includes(`"${date}"`));

  if (!line) {
    throw new Error(`Schedule not found for ${date}`);
  }

  const matches = [...line.matchAll(/(\w+): "([^"]+)"/g)];

  return Object.fromEntries(
    matches.map((match) => [match[1], match[2]])
  );
}

function addMinutes(date: string, time: string, minutes: number) {
  return DateTime.fromFormat(
    `${date} ${time}`,
    "yyyy-MM-dd h:mm a",
    { zone: ZONE }
  )
    .plus({ minutes })
    .toFormat("h:mm a");
}

function toTickTickDate(date: string, time: string) {
  return DateTime.fromFormat(
    `${date} ${time}`,
    "yyyy-MM-dd h:mm a",
    { zone: ZONE }
  ).toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
}

async function main() {
  const token = process.env.TICKTICK_ACCESS_TOKEN;
  const projectId = process.env.TICKTICK_PRAYER_PROJECT_ID;

  const today = DateTime.now()
    .setZone(ZONE)
    .toFormat("yyyy-MM-dd");

  const iqamah = await getSchedule(
    "https://iqamah.ca/schedule.js?v=2026.07",
    today
  );

  const adhan = await getSchedule(
    "https://iqamah.ca/salahschedule.js?v=2026.07",
    today
  );

  const times = {
    Fajr: iqamah.fajr,
    Dhuhr: iqamah.zuhr,
    Asr: iqamah.asr,
    Maghrib: addMinutes(today, adhan.maghrib, 10),
    Isha: addMinutes(today, adhan.isha, 10),
  };

  const response = await fetch(
    `https://api.ticktick.com/open/v1/project/${projectId}/data`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  for (const [title, time] of Object.entries(times)) 
  {
    const date = toTickTickDate(today, time);

    const existing = data.tasks.find(
    (task: any) => task.title === title
    );

    if (existing) {
        const currentTime = DateTime.fromISO(existing.startDate).toMillis();
        const desiredTime = DateTime.fromISO(date).toMillis();

        if (currentTime === desiredTime) 
		{
			console.log(title, "UNCHANGED");
			continue;
        }
        const response = await fetch(
		`https://api.ticktick.com/open/v1/task/${existing.id}`,
        {
            method: "POST",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            },
            body: JSON.stringify({
            id: existing.id,
            projectId,
            title,
            isAllDay: false,
            startDate: date,
            dueDate: date,
            timeZone: ZONE,
            reminders: ["TRIGGER:PT0S"],
            }),
        }
        );

        console.log(title, "UPDATED", response.status);
    } else {
        const response = await fetch(
        "https://api.ticktick.com/open/v1/task",
        {
            method: "POST",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            },
            body: JSON.stringify({
            projectId,
            title,
            isAllDay: false,
            startDate: date,
            dueDate: date,
            timeZone: ZONE,
            reminders: ["TRIGGER:PT0S"],
            }),
        }
        );

        console.log(title, "CREATED", response.status);
    }
  }
}

main();