namespace TrainFlow.BuildingBlocks;

public sealed class ApiException(int status, string code, string message, IDictionary<string, string[]>? errors = null)
    : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IDictionary<string, string[]>? Errors { get; } = errors;
    public static ApiException Invalid(string message) => new(400, "VALIDATION_FAILED", message,
        new Dictionary<string, string[]> { ["request"] = [message] });
    public static ApiException NotFound() => new(404, "RESOURCE_NOT_FOUND", "The resource was not found.");
    public static ApiException Conflict(string message) => new(409, "CONFLICT", message);
}
