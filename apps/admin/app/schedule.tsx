"use client";
import { useState } from "react";
type Window = { startMinute: number; endMinute: number };
type DayWindow = Window & { day: number };
type Holiday = { date: string; windows: Window[] };
const days = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];
const clock = (minute: number) =>
  String(Math.floor(minute / 60) % 24).padStart(2, "0") +
  ":" +
  String(minute % 60).padStart(2, "0");
const minute = (text: string) => {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
};
function WindowFields({
  value,
  onChange,
}: {
  value: Window;
  onChange: (v: Window) => void;
}) {
  return (
    <div className="form-row">
      <label>
        С
        <input
          type="time"
          required
          value={clock(value.startMinute)}
          onChange={(e) =>
            onChange({ ...value, startMinute: minute(e.target.value) })
          }
        />
      </label>
      <label>
        До
        <input
          type="time"
          required
          disabled={value.endMinute === 1440}
          value={clock(value.endMinute)}
          onChange={(e) =>
            onChange({ ...value, endMinute: minute(e.target.value) })
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.endMinute === 1440}
          onChange={(e) =>
            onChange({ ...value, endMinute: e.target.checked ? 1440 : 1320 })
          }
        />{" "}
        До конца суток
      </label>
    </div>
  );
}
export default function ScheduleEditor({
  schedule: initial,
  holidays: input,
}: {
  schedule: DayWindow[];
  holidays: Holiday[] | Record<string, Window[]>;
}) {
  const [schedule, setSchedule] = useState(initial),
    [holidays, setHolidays] = useState<Holiday[]>(
      Array.isArray(input)
        ? input
        : Object.entries(input ?? {}).map(([date, windows]) => ({
            date,
            windows,
          })),
    );
  return (
    <>
      <input name="schedule" type="hidden" value={JSON.stringify(schedule)} />
      <input name="holidays" type="hidden" value={JSON.stringify(holidays)} />
      <h3>Недельное расписание</h3>
      <p>
        Время местное для филиала. Ночной интервал разделите между двумя днями.
        Без интервалов приём заказов закрыт.
      </p>
      {schedule.map((window, index) => (
        <fieldset key={index}>
          <legend>Интервал {index + 1}</legend>
          <label>
            День недели
            <select
              value={window.day}
              onChange={(e) =>
                setSchedule(
                  schedule.map((w, i) =>
                    i === index ? { ...w, day: Number(e.target.value) } : w,
                  ),
                )
              }
            >
              {days.map((name, day) => (
                <option value={day} key={day}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <WindowFields
            value={window}
            onChange={(value) =>
              setSchedule(
                schedule.map((w, i) =>
                  i === index ? { ...value, day: w.day } : w,
                ),
              )
            }
          />
          <button
            type="button"
            onClick={() => setSchedule(schedule.filter((_, i) => i !== index))}
          >
            Удалить интервал
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={schedule.length >= 70}
        onClick={() =>
          setSchedule([
            ...schedule,
            { day: 1, startMinute: 540, endMinute: 1320 },
          ])
        }
      >
        Добавить рабочий интервал
      </button>
      <h3>Исключения по датам</h3>
      <p>
        Дата без интервалов означает выходной. Исключение заменяет недельное
        расписание на этот день.
      </p>
      {holidays.map((holiday, index) => (
        <fieldset key={index}>
          <legend>Исключение {index + 1}</legend>
          <label>
            Дата филиала
            <input
              type="date"
              required
              value={holiday.date}
              onChange={(e) =>
                setHolidays(
                  holidays.map((h, i) =>
                    i === index ? { ...h, date: e.target.value } : h,
                  ),
                )
              }
            />
          </label>
          {holiday.windows.map((window, w) => (
            <div key={w}>
              <WindowFields
                value={window}
                onChange={(value) =>
                  setHolidays(
                    holidays.map((h, i) =>
                      i === index
                        ? {
                            ...h,
                            windows: h.windows.map((v, j) =>
                              j === w ? value : v,
                            ),
                          }
                        : h,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  setHolidays(
                    holidays.map((h, i) =>
                      i === index
                        ? { ...h, windows: h.windows.filter((_, j) => j !== w) }
                        : h,
                    ),
                  )
                }
              >
                Удалить часы исключения
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={holiday.windows.length >= 10}
            onClick={() =>
              setHolidays(
                holidays.map((h, i) =>
                  i === index
                    ? {
                        ...h,
                        windows: [
                          ...h.windows,
                          { startMinute: 540, endMinute: 1320 },
                        ],
                      }
                    : h,
                ),
              )
            }
          >
            Добавить часы исключения
          </button>
          <button
            type="button"
            onClick={() => setHolidays(holidays.filter((_, i) => i !== index))}
          >
            Удалить исключение
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={holidays.length >= 366}
        onClick={() => setHolidays([...holidays, { date: "", windows: [] }])}
      >
        Добавить исключение
      </button>
    </>
  );
}
