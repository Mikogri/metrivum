using MotionTrace.Core.Motion;

namespace Metrivum.MotionTraceBridge;

public sealed record SequencePhase(
    string Kind,
    double StartSeconds,
    double EndSeconds,
    double? MeanSpeed,
    double? PeakSpeed
);

public sealed record MotionSequence(
    int Number,
    double StartSeconds,
    double EndSeconds,
    double? MeanSpeed,
    double? PeakSpeed,
    SequencePhase[] Phases
);

/// <summary>Direction-only measurement, not exercise classification. Gaps always break sequences.</summary>
public static class DirectionalSequences
{
    public static MotionSequence[] Detect(IReadOnlyList<MovementPoint> points, int frameHeight)
    {
        var result = new List<MotionSequence>();
        double travel = Math.Max(4, frameHeight * .01);
        foreach (var segment in points.GroupBy(p => p.Segment))
        {
            var p = segment.ToArray();
            if (p.Length < 3)
                continue;
            var phases = new List<(int Start, int End)>();
            int anchor = 0,
                extreme = 0,
                direction = 0;
            for (int i = 1; i < p.Length; i++)
            {
                if (direction == 0)
                {
                    if (Math.Abs(p[i].Y - p[anchor].Y) < travel)
                        continue;
                    direction = Math.Sign(p[i].Y - p[anchor].Y);
                    extreme = i;
                }
                else if ((p[i].Y - p[extreme].Y) * direction >= 0)
                    extreme = i;
                else if (
                    (p[extreme].Y - p[i].Y) * direction >= travel
                    && p[i].Time - p[extreme].Time >= .10
                )
                {
                    Add(anchor, extreme);
                    anchor = extreme;
                    extreme = i;
                    direction = -direction;
                }
            }
            Add(anchor, extreme);
            var group = new List<SequencePhase>();
            double baseline = 0;
            foreach (var (start, end) in phases)
            {
                var stroke = p[start..(end + 1)];
                int sign = Math.Sign(p[end].Y - p[start].Y);
                if (group.Count == 0)
                {
                    baseline = p[start].Y;
                }
                if (group.Count > 0 && p[start].Time - group[^1].EndSeconds >= .15)
                    group.Add(new("pause", group[^1].EndSeconds, p[start].Time, null, null));
                group.Add(
                    new(
                        sign < 0 ? "concentric" : "eccentric",
                        p[start].Time,
                        p[end].Time,
                        Math.Abs(p[end].Y - p[start].Y) / (p[end].Time - p[start].Time),
                        stroke.Max(point => Math.Max(0, point.Velocity * sign))
                    )
                );
                // Close only after returning to the starting level, not at an intermediate catch or rack.
                if (group.Count > 1 && Math.Abs(p[end].Y - baseline) <= travel)
                    Flush();
            }
            Flush();
            void Add(int a, int b)
            {
                int movingStart = a;
                for (int i = a; i <= b; i++)
                {
                    if (Math.Abs(p[i].Velocity) > travel * .5)
                        continue;
                    int quiet = i;
                    while (i < b && Math.Abs(p[i + 1].Velocity) <= travel * .5)
                        i++;
                    if (p[i].Time - p[quiet].Time < .2)
                        continue;
                    Store(movingStart, quiet);
                    movingStart = i;
                }
                Store(movingStart, b);
            }
            void Store(int a, int b)
            {
                while (a + 1 < b && Math.Abs(p[a + 1].Y - p[a].Y) <= travel * .1)
                    a++;
                while (b - 1 > a && Math.Abs(p[b - 1].Y - p[b].Y) <= travel * .1)
                    b--;
                if (b > a && p[b].Time - p[a].Time >= .10 && Math.Abs(p[b].Y - p[a].Y) >= travel)
                    phases.Add((a, b));
            }
            void Flush()
            {
                if (group.Count == 0)
                    return;
                var lifting = group.Where(phase => phase.Kind == "concentric").ToArray();
                if (lifting.Length > 0)
                {
                    double duration = lifting.Sum(phase => phase.EndSeconds - phase.StartSeconds);
                    result.Add(
                        new(
                            result.Count + 1,
                            group[0].StartSeconds,
                            group[^1].EndSeconds,
                            lifting.Sum(phase =>
                                phase.MeanSpeed!.Value * (phase.EndSeconds - phase.StartSeconds)
                            ) / duration,
                            lifting.Max(phase => phase.PeakSpeed),
                            group.ToArray()
                        )
                    );
                }
                group.Clear();
            }
        }
        return result.ToArray();
    }
}
