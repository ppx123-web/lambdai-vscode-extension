def parse_csv_lambdai(fname: 'PosixPath'):
    """
    parse csv file {fname}, return header, rows. Header is a list
    """
    import csv
    with open(fname, 'r') as csvfile:
        csvreader = csv.reader(csvfile)
        header = next(csvreader)
        rows = list(csvreader)
    return header, rows